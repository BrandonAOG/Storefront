"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./Cart";

/**
 * Thumb-reach bar on phones: call or book without scrolling back to the top.
 * Hidden on the booking and form pages, which have their own main button.
 */
export function MobileBar({ tel, phone }: { tel: string; phone: string }) {
  const pathname = usePathname();
  const { count } = useCart();
  if (/^\/(book|quote|visit|call|feedback|unsubscribe|order|virtual-visit)|^\/plans\/./.test(pathname)) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md gap-2">
        {phone && <a href={tel} className="btn btn-ghost flex-1" aria-label={`Call ${phone}`}>Call</a>}
        <Link href={count > 0 ? "/book" : "/#services"} className="btn btn-primary flex-[2]">
          {count > 0 ? `Continue booking (${count})` : "Book service"}
        </Link>
      </div>
    </div>
  );
}
