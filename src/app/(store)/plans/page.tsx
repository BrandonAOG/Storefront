import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Maintenance plans" };

export default async function PlansPage() {
  const plans = await db().select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(asc(schema.plans.sortOrder));
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-bold tracking-tight">Maintenance plans</h1>
      <p className="mt-3 max-w-2xl text-lg text-slate-600">Every plan includes scheduled maintenance and electronic monitoring between visits, so your generator starts when the power doesn&apos;t.</p>
      {plans.length === 0 && <p className="mt-8 text-slate-600">Plans are coming soon.</p>}
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className="card flex flex-col">
            <h2 className="text-xl font-bold">{p.name}</h2>
            <p className="mt-1 text-sm text-slate-600">{p.summary}</p>
            <p className="mt-4 text-4xl font-bold">{p.priceCents > 0 ? <>{money(p.priceCents)}<span className="text-base font-medium text-slate-500"> / {p.interval}</span></> : <span className="text-2xl">Call for pricing</span>}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {p.features.split("\n").filter(Boolean).map((f) => (
                <li key={f} className="flex gap-2"><span className="text-green-600" aria-hidden>✓</span>{f}</li>
              ))}
            </ul>
            <Link href={`/plans/${p.slug}`} className="btn btn-primary mt-6">{p.priceCents > 0 ? `Choose ${p.name}` : `Ask about ${p.name}`}</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
