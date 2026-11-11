import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { deletePlan, savePlan } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function PlanEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === "new";
  const p = isNew ? null : /^\d+$/.test(id) ? (await db().select().from(schema.plans).where(eq(schema.plans.id, Number(id))))[0] : null;
  if (!isNew && !p) notFound();
  const { error } = await searchParams;
  return (
    <>
      <Link href="/admin/plans" className="text-sm text-slate-500 hover:underline">← Plans</Link>
      <h1 className="mt-2 text-2xl font-bold">{p ? `Edit ${p.name}` : "Add plan"}</h1>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">A name is required.</p>}
      <form action={savePlan} className="card mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
        {p && <input type="hidden" name="id" value={p.id} />}
        <label><span className="label">Name</span><input className="input" name="name" required maxLength={120} defaultValue={p?.name} /></label>
        <label><span className="label">Web address ending (optional)</span><input className="input" name="slug" maxLength={80} defaultValue={p?.slug} placeholder="made from the name" /></label>
        <label><span className="label">Price in dollars</span><input className="input" name="price" inputMode="decimal" required defaultValue={p ? (p.priceCents / 100).toFixed(2) : ""} /></label>
        <label><span className="label">Billed every</span>
          <select className="input" name="interval" defaultValue={p?.interval ?? "year"}><option value="year">Year</option><option value="month">Month</option></select>
        </label>
        <label className="sm:col-span-2"><span className="label">Short summary</span><input className="input" name="summary" maxLength={300} defaultValue={p?.summary} /></label>
        <label className="sm:col-span-2"><span className="label">What&apos;s included (one per line)</span><textarea className="input" name="features" rows={6} maxLength={3000} defaultValue={p?.features} /></label>
        <label><span className="label">Sort order (low numbers first)</span><input className="input" name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 0} /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Show on the storefront</label>
        <button className="btn btn-dark sm:col-span-2">Save plan</button>
      </form>
      {p && (
        <>
          <p className="mt-3 max-w-2xl text-xs text-slate-500">A price change applies to new sign-ups only. Existing subscribers keep their current price in Stripe.</p>
          <form action={deletePlan} className="mt-4">
            <input type="hidden" name="id" value={p.id} />
            <button className="btn btn-danger">Delete plan</button>
          </form>
        </>
      )}
    </>
  );
}
