import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

const nav = [
  ["/admin", "Overview"],
  ["/admin/orders", "Bookings"],
  ["/admin/visits", "Virtual visits"],
  ["/admin/quotes", "Estimates"],
  ["/admin/memberships", "Memberships"],
  ["/admin/customers", "Customers"],
  ["/admin/feedback", "Feedback"],
  ["/admin/analytics", "Analytics"],
  ["/admin/messages", "Messages"],
  ["/admin/services", "Services"],
  ["/admin/plans", "Plans"],
  ["/admin/availability", "Availability"],
  ["/admin/integrations", "Integrations"],
  ["/admin/settings", "Settings"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex-1">
      <header className="border-b border-black bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-x-5 overflow-x-auto whitespace-nowrap px-4 py-1 text-sm lg:flex-wrap lg:overflow-visible lg:py-2">
          <span className="font-display font-extrabold text-brand">AOG Admin</span>
          {nav.map(([href, label]) => <Link key={href} href={href} className="py-3 text-slate-300 hover:text-white lg:py-1">{label}</Link>)}
          <span className="flex-1" />
          <Link href="/" className="text-slate-300 hover:text-white">View store ↗</Link>
          <form action={logout}><button className="text-slate-300 hover:text-white">Sign out</button></form>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
