"use client";

import Link from "next/link";
import { track } from "./Tracker";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartLine = { serviceId: number; qty: number };
type CartApi = {
  lines: CartLine[];
  ready: boolean;
  count: number;
  add: (serviceId: number) => void;
  setQty: (serviceId: number, qty: number) => void;
  clear: () => void;
};

const KEY = "aog_cart_v1";
const Ctx = createContext<CartApi | null>(null);

function read(): CartLine[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l): l is CartLine => Number.isInteger(l?.serviceId) && Number.isInteger(l?.qty) && l.qty > 0)
      .map((l) => ({ serviceId: l.serviceId, qty: Math.min(10, l.qty) }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from browser storage
    setLines(read());
    setReady(true);
  }, []);

  const save = useCallback((next: CartLine[]) => {
    setLines(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: cart lives in memory only */
    }
  }, []);

  const api = useMemo<CartApi>(
    () => ({
      lines,
      ready,
      count: lines.reduce((n, l) => n + l.qty, 0),
      add: (serviceId) => {
        track("add_to_cart");
        const existing = lines.find((l) => l.serviceId === serviceId);
        save(
          existing
            ? lines.map((l) => (l.serviceId === serviceId ? { ...l, qty: Math.min(10, l.qty + 1) } : l))
            : [...lines, { serviceId, qty: 1 }],
        );
      },
      setQty: (serviceId, qty) =>
        save(qty <= 0 ? lines.filter((l) => l.serviceId !== serviceId) : lines.map((l) => (l.serviceId === serviceId ? { ...l, qty: Math.min(10, qty) } : l))),
      clear: () => save([]),
    }),
    [lines, ready, save],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

export function CartButton() {
  const { count } = useCart();
  return (
    <Link href="/book" className="btn btn-primary">
      Book now{count > 0 && <span className="rounded-full bg-black px-2 py-0.5 text-xs text-white">{count}</span>}
    </Link>
  );
}

export function AddToCart({ serviceId, className = "" }: { serviceId: number; className?: string }) {
  const { lines, add } = useCart();
  const inCart = lines.some((l) => l.serviceId === serviceId);
  if (inCart) {
    return (
      <Link href="/book" className={`btn btn-dark ${className}`}>
        Added – choose a time →
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => add(serviceId)} className={`btn btn-primary ${className}`}>
      Add to booking
    </button>
  );
}
