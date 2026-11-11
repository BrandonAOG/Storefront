import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { MembershipForm } from "@/components/MembershipForm";
import { money } from "@/lib/format";
import { stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p] = await db().select().from(schema.plans).where(and(eq(schema.plans.slug, slug), eq(schema.plans.active, true)));
  if (!p) notFound();
  const price = `${money(p.priceCents)} / ${p.interval}`;
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Link href="/plans" className="text-sm text-slate-500 hover:underline">← All plans</Link>
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{p.name}</h1>
          <p className="mt-2 text-lg text-slate-600">{p.summary}</p>
          <p className="mt-5 text-3xl font-bold">{price}</p>
          <ul className="mt-5 space-y-2">
            {p.features.split("\n").filter(Boolean).map((f) => (
              <li key={f} className="flex gap-2"><span className="text-green-600" aria-hidden>✓</span>{f}</li>
            ))}
          </ul>
        </div>
        <MembershipForm planId={p.id} payOnline={stripeEnabled()} cta={stripeEnabled() ? `Subscribe – ${price}` : "Request this plan"} />
      </div>
    </div>
  );
}
