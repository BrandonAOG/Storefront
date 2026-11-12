import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ManageBilling } from "@/components/ManageBilling";
import { money } from "@/lib/format";
import { syncMembershipPayment } from "@/lib/payments";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan confirmation", robots: { index: false } };

export default async function PlanThanks({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  let [m] = await db().select().from(schema.memberships).where(eq(schema.memberships.token, token));
  if (!m) notFound();
  if (await syncMembershipPayment(m).catch(() => false)) {
    [m] = await db().select().from(schema.memberships).where(eq(schema.memberships.token, token));
  }
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="card">
        <h1 className="text-3xl font-bold tracking-tight">{m.status === "active" ? "Welcome aboard!" : m.status === "cancelled" ? "Plan cancelled" : "Request received"}</h1>
        <p className="mt-2 text-slate-600">
          {m.status === "active"
            ? `Your ${m.planName} plan is active. We'll be in touch to schedule your first visit.`
            : m.status === "cancelled"
              ? "This plan is no longer active."
              : `Thanks, ${m.name.split(" ")[0]}. We have your request for the ${m.planName} plan and will contact you to finish setup.`}
        </p>
        <p className="mt-4 text-sm"><strong>{m.planName}</strong> – {money(m.priceCents)} / {m.interval}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {m.status === "active" && m.stripeCustomerId && <ManageBilling token={token} />}
          <Link href="/" className="btn btn-ghost">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
