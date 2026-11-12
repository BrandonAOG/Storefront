import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AddToCart } from "@/components/Cart";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const [s] = await db().select().from(schema.services).where(and(eq(schema.services.slug, slug), eq(schema.services.active, true)));
  return s;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const s = await load((await params).slug);
  return s ? { title: s.name, description: s.summary } : {};
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await load((await params).slug);
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/#services" className="text-sm text-slate-500 hover:underline">← All services</Link>
      {/* eslint-disable-next-line @next/next/no-img-element -- admin-supplied image address */}
      {s.imageUrl && <img src={s.imageUrl} alt="" className="mt-6 h-64 w-full rounded-2xl object-cover" />}
      <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-slate-500">{s.category}</p>
      <h1 className="mt-1 text-4xl font-bold tracking-tight">{s.name}</h1>
      <p className="mt-3 text-lg text-slate-600">{s.summary}</p>
      <div className="card mt-8 flex flex-wrap items-center justify-between gap-4">
        {s.priceType === "fixed" ? (
          <>
            <div>
              <p className="text-3xl font-bold">{money(s.priceCents)}</p>
              <p className="text-sm text-slate-500">Upfront price</p>
            </div>
            <AddToCart serviceId={s.id} className="px-6 py-3 text-base" />
          </>
        ) : (
          <>
            <div>
              <p className="text-xl font-bold">Custom quote</p>
              <p className="text-sm text-slate-500">Priced after a short virtual visit</p>
            </div>
            <Link href={`/virtual-visit?topic=${encodeURIComponent(s.name)}`} className="btn btn-dark px-6 py-3 text-base">Request a virtual visit</Link>
          </>
        )}
      </div>
      {s.includes.trim() && (
        <div className="mt-8">
          <h2 className="text-lg font-bold">What&apos;s included</h2>
          <ul className="mt-3 space-y-2">
            {s.includes.split("\n").filter((l) => l.trim()).map((line) => (
              <li key={line} className="flex gap-2"><span className="text-green-600" aria-hidden>✓</span>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {s.description && <div className="mt-8 whitespace-pre-line leading-relaxed text-slate-700">{s.description}</div>}
    </div>
  );
}
