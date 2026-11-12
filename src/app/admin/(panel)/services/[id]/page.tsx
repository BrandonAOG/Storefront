import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { deleteService, saveService } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function ServiceEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === "new";
  const s = isNew ? null : /^\d+$/.test(id) ? (await db().select().from(schema.services).where(eq(schema.services.id, Number(id))))[0] : null;
  if (!isNew && !s) notFound();
  const { error } = await searchParams;
  return (
    <>
      <Link href="/admin/services" className="text-sm text-slate-500 hover:underline">← Services</Link>
      <h1 className="mt-2 text-2xl font-bold">{s ? `Edit ${s.name}` : "Add service"}</h1>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error === "image" ? "The photo must be a JPG, PNG or WebP under 4 MB." : "A name is required."}</p>}
      <form action={saveService} className="card mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
        {s && <input type="hidden" name="id" value={s.id} />}
        <label className="sm:col-span-2"><span className="label">Name</span><input className="input" name="name" required maxLength={120} defaultValue={s?.name} /></label>
        <label><span className="label">Category</span><input className="input" name="category" maxLength={60} defaultValue={s?.category ?? "Service"} /></label>
        <label><span className="label">Web address ending (optional)</span><input className="input" name="slug" maxLength={80} defaultValue={s?.slug} placeholder="made from the name" /></label>
        <label><span className="label">Pricing</span>
          <select className="input" name="priceType" defaultValue={s?.priceType ?? "fixed"}>
            <option value="fixed">Fixed price, bookable online</option>
            <option value="quote">Custom quote, starts with a virtual visit</option>
          </select>
        </label>
        <label><span className="label">Price in dollars (fixed price only)</span><input className="input" name="price" inputMode="decimal" defaultValue={s ? (s.priceCents / 100).toFixed(2) : ""} /></label>
        <label className="sm:col-span-2"><span className="label">Short summary (shown on the card)</span><input className="input" name="summary" maxLength={300} defaultValue={s?.summary} /></label>
        <label className="sm:col-span-2"><span className="label">Full description</span><textarea className="input" name="description" rows={6} maxLength={5000} defaultValue={s?.description} /></label>
        <label className="sm:col-span-2"><span className="label">What&apos;s included (one per line, shown as a checklist)</span><textarea className="input" name="includes" rows={4} maxLength={2000} defaultValue={s?.includes} /></label>
        <label className="sm:col-span-2">
          <span className="label">Photo</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-supplied image address */}
          {s?.imageUrl && <img src={s.imageUrl} alt="" className="mb-2 h-32 rounded-lg object-cover" />}
          {process.env.BLOB_READ_WRITE_TOKEN ? <input className="input mb-2" type="file" name="image" accept="image/jpeg,image/png,image/webp" /> : <span className="mb-2 block text-xs text-slate-500">Connect Vercel Blob storage to upload photos here. Until then, paste the address of an image that is already online.</span>}
          <input className="input" name="imageUrl" type="url" maxLength={500} defaultValue={s?.imageUrl} placeholder="https://… (leave empty for no photo)" />
        </label>
        <label>
          <span className="label">Only offered in these ZIP codes</span>
          <input className="input" name="zips" defaultValue={s?.zips} placeholder="Empty = whole service area" />
        </label>
        <label>
          <span className="label">Extra notice needed (days)</span>
          <input className="input" name="leadDays" type="number" min={0} max={60} defaultValue={s?.leadDays ?? 0} />
        </label>
        <label><span className="label">Sort order (low numbers first)</span><input className="input" name="sortOrder" type="number" defaultValue={s?.sortOrder ?? 0} /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={s?.active ?? true} /> Show on the storefront</label>
        <button className="btn btn-dark sm:col-span-2">Save service</button>
      </form>
      {s && (
        <form action={deleteService} className="mt-4">
          <input type="hidden" name="id" value={s.id} />
          <button className="btn btn-danger">Delete service</button>
          <span className="ml-3 text-xs text-slate-500">Past bookings keep their own copy of the name and price.</span>
        </form>
      )}
    </>
  );
}
