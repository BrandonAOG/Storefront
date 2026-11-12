import Link from "next/link";
import { CartButton, CartProvider } from "@/components/Cart";
import { Tracker } from "@/components/Tracker";
import { BRAND } from "@/lib/brand";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const tel = `tel:${s.phone.replace(/[^\d+]/g, "")}`;
  return (
    <CartProvider>
      <Tracker />
      <div className="bg-black text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1.5 text-xs sm:text-sm">
          <span className="font-semibold">{BRAND.tagline}</span>
          {s.phone && <a href={tel} className="font-bold text-brand hover:underline">Call {s.phone}</a>}
        </div>
      </div>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="shrink-0" aria-label={`${s.businessName} home`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- brand logo served from the main website */}
            <img src={BRAND.logo} alt={s.businessName} width={201} height={53} className="h-10 w-auto font-display text-lg font-extrabold sm:h-12" />
          </Link>
          <nav className="font-display hidden items-center gap-6 text-sm font-bold text-black md:flex">
            <Link href="/#services" className="hover:text-brand-dark">Services</Link>
            <Link href="/plans" className="hover:text-brand-dark">Maintenance plans</Link>
            <Link href="/virtual-visit" className="hover:text-brand-dark">Virtual visit</Link>
          </nav>
          <CartButton />
        </div>
        <nav className="font-display flex justify-center gap-5 border-t border-slate-200 px-4 py-2 text-xs font-bold md:hidden">
          <Link href="/#services">Services</Link>
          <Link href="/plans">Plans</Link>
          <Link href="/virtual-visit">Virtual visit</Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-8 text-sm">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element -- brand logo served from the main website */}
            <img src={BRAND.logoInverse} alt={s.businessName} width={201} height={53} className="h-11 w-auto font-display text-lg font-extrabold" />
            <p className="mt-3 text-slate-300">{BRAND.area}</p>
          </div>
          <div className="space-y-1 text-slate-300 sm:text-right">
            {s.phone && <p><a href={tel} className="font-bold text-brand hover:underline">{s.phone}</a></p>}
            {s.email && <p><a href={`mailto:${s.email}`} className="hover:underline">{s.email}</a></p>}
            <p><a href={BRAND.mainSite} className="hover:underline">alwaysongenerators.com</a></p>
            <p className="text-slate-400">© {new Date().getFullYear()} {s.businessName}</p>
          </div>
        </div>
      </footer>
    </CartProvider>
  );
}
