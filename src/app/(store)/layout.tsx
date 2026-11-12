import Link from "next/link";
import { CartButton, CartProvider } from "@/components/Cart";
import { Tracker } from "@/components/Tracker";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <CartProvider>
      <Tracker />
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-slate-950" aria-hidden>⚡</span>
            {s.businessName}
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <Link href="/#services" className="hover:text-white">Services</Link>
            <Link href="/plans" className="hover:text-white">Maintenance plans</Link>
            <Link href="/virtual-visit" className="hover:text-white">Virtual visit</Link>
            {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="hover:text-white">{s.phone}</a>}
          </nav>
          <CartButton />
        </div>
        <nav className="flex justify-center gap-5 border-t border-slate-800 px-4 py-2 text-xs text-slate-300 md:hidden">
          <Link href="/#services">Services</Link>
          <Link href="/plans">Plans</Link>
          <Link href="/virtual-visit">Virtual visit</Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} {s.businessName}</p>
          <p className="flex gap-4">
            {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>{s.phone}</a>}
            {s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}
          </p>
        </div>
      </footer>
    </CartProvider>
  );
}
