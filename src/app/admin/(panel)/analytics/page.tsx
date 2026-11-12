import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
const RANGES = [7, 30, 90];
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "–");

export default async function AnalyticsAdmin({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const days = RANGES.includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const since = sql`now() - make_interval(days => ${days})`;
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db().execute(query)) as unknown as T[];

  const [funnel, sources, variants, [quotes], [visits], [plans]] = await Promise.all([
    q<{ type: string; n: number }>(sql`select type, count(distinct visitor_id)::int n from events where created_at > ${since} group by type`),
    q<{ source: string; visitors: number; bookings: number; revenue: number; visits: number; plans: number }>(sql`
      with v as (select source, count(distinct visitor_id)::int visitors from events where type = 'view' and created_at > ${since} group by source),
           o as (select source, count(*)::int bookings, coalesce(sum(subtotal_cents), 0)::int revenue from orders where status in ('confirmed','completed') and created_at > ${since} group by source),
           r as (select source, count(*)::int visits from visits where created_at > ${since} group by source),
           m as (select source, count(*)::int plans from memberships where status <> 'cancelled' and created_at > ${since} group by source)
      select s.source, coalesce(v.visitors, 0) visitors, coalesce(o.bookings, 0) bookings, coalesce(o.revenue, 0) revenue, coalesce(r.visits, 0) visits, coalesce(m.plans, 0) plans
      from (select source from v union select source from o union select source from r union select source from m) s
      left join v using (source) left join o using (source) left join r using (source) left join m using (source)
      order by revenue desc, visitors desc limit 25`),
    q<{ variant: string; visitors: number; converted: number }>(sql`
      select variant, count(distinct visitor_id) filter (where type = 'view')::int visitors,
             count(distinct visitor_id) filter (where type in ('order','visit','membership'))::int converted
      from events where variant <> '' and created_at > ${since} group by variant order by variant`),
    q<{ sent: number; opened: number; accepted: number; value: number }>(sql`
      select count(*) filter (where status <> 'draft')::int sent, count(viewed_at) filter (where status <> 'draft')::int opened,
             count(*) filter (where status = 'accepted')::int accepted, coalesce(sum(total_cents) filter (where status = 'accepted'), 0)::int value
      from quotes where created_at > ${since}`),
    q<{ n: number; quoted: number }>(sql`select count(*)::int n, count(*) filter (where exists (select 1 from quotes x where x.visit_id = visits.id and x.status <> 'draft'))::int quoted from visits where created_at > ${since}`),
    q<{ n: number; active: number }>(sql`select count(*) filter (where created_at > ${since})::int n, count(*) filter (where status = 'active')::int active from memberships`),
  ]);

  const count = (type: string) => funnel.find((f) => f.type === type)?.n ?? 0;
  const steps: [string, number][] = [["Visited the site", count("view")], ["Added a service", count("add_to_cart")], ["Started checkout", count("checkout_start")], ["Booked", count("order")]];
  const top = Math.max(1, steps[0][1]);
  const tiles: [string, string, string][] = [
    ["Booking conversion", pct(count("order"), count("view")), "visitors who booked"],
    ["Estimate close rate", pct(quotes.accepted, quotes.sent), `${quotes.accepted} accepted of ${quotes.sent} sent · ${money(quotes.value)}`],
    ["Virtual visits", String(visits.n), `${visits.quoted} turned into an estimate`],
    ["Plan sign-ups", String(plans.n), `${plans.active} active in total`],
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex gap-2 text-sm">
          {RANGES.map((d) => <Link key={d} href={`/admin/analytics?days=${d}`} className={`rounded-full px-3 py-1 font-semibold ${d === days ? "bg-ink text-white" : "bg-slate-200 text-slate-700"}`}>{d} days</Link>)}
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        {tiles.map(([label, value, sub]) => <div key={label} className="card"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p><p className="text-sm text-slate-500">{sub}</p></div>)}
      </div>

      <div className="card mt-4">
        <h2 className="font-bold">Booking funnel</h2>
        <p className="text-sm text-slate-500">Unique visitors reaching each step.</p>
        <div className="mt-4 space-y-3">
          {steps.map(([label, n], i) => (
            <div key={label}>
              <div className="flex justify-between text-sm"><span className="font-medium">{label}</span><span>{n}{i > 0 && <span className="text-slate-500"> · {pct(n, steps[i - 1][1])} of previous</span>}</span></div>
              <div className="mt-1 h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-brand" style={{ width: `${Math.max(n ? 1.5 : 0, (n / top) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto p-0">
        <h2 className="px-5 pt-5 font-bold">Where customers come from</h2>
        <p className="px-5 text-sm text-slate-500">Based on the first link that brought each visitor. Tag ad links with <code>?utm_source=…&amp;utm_campaign=…</code> to see them by name.</p>
        <table className="table mt-3">
          <thead><tr><th>Source</th><th>Visitors</th><th>Bookings</th><th>Booked revenue</th><th>Conversion</th><th>Visit requests</th><th>Plans</th></tr></thead>
          <tbody>
            {sources.length === 0 && <tr><td colSpan={7} className="text-slate-500">No activity in this period.</td></tr>}
            {sources.map((s) => (
              <tr key={s.source}><td className="font-semibold">{s.source}</td><td>{s.visitors}</td><td>{s.bookings}</td><td>{money(s.revenue)}</td><td>{pct(s.bookings, s.visitors)}</td><td>{s.visits}</td><td>{s.plans}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt-4 overflow-x-auto p-0">
        <h2 className="px-5 pt-5 font-bold">Headline A/B test</h2>
        <p className="px-5 text-sm text-slate-500">Set up in Settings. “Converted” counts a booking, a visit request or a plan sign-up. Small numbers swing a lot; wait for a few hundred visitors per version before deciding.</p>
        <table className="table mt-3">
          <thead><tr><th>Version</th><th>Visitors</th><th>Converted</th><th>Rate</th></tr></thead>
          <tbody>
            {variants.length === 0 && <tr><td colSpan={4} className="text-slate-500">No test has run in this period.</td></tr>}
            {variants.map((v) => <tr key={v.variant}><td className="font-semibold">{v.variant === "A" ? "A (original)" : "B (alternative)"}</td><td>{v.visitors}</td><td>{v.converted}</td><td>{pct(v.converted, v.visitors)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
