import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Service } from "@/db/schema";
import { AddToCart } from "@/components/Cart";
import { money } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getAttribution } from "@/lib/visitor";

export const dynamic = "force-dynamic";

const faqs = [
  ["Is the price I see the price I pay?", "Yes. Fixed-price services are charged exactly as listed. If the technician finds additional work is needed, you approve it before anything is done."],
  ["Do I have to call to book?", "No. Pick your services, choose an arrival window and check out. You'll get a confirmation page with your booking details right away."],
  ["What if I'm outside your service area?", "Enter your ZIP code at checkout. If we can't reach you yet, we'll tell you before you pay."],
  ["What is a virtual visit?", "A short video or phone consultation. For installations and larger jobs we look at your site remotely, answer questions and prepare a quote without sending a truck first."],
  ["How do maintenance plans work?", "A plan covers scheduled maintenance for your generator at a set price, billed monthly or yearly. You can cancel any time."],
];

function ServiceCard({ s }: { s: Service }) {
  return (
    <div className="card flex flex-col overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- admin-supplied image address */}
      {s.imageUrl && <img src={s.imageUrl} alt="" loading="lazy" className="-mx-5 -mt-5 mb-4 h-40 w-[calc(100%+2.5rem)] max-w-none object-cover" />}
      <h3 className="text-lg font-semibold">
        <Link href={`/services/${s.slug}`} className="hover:underline">{s.name}</Link>
      </h3>
      <p className="mt-1 flex-1 text-sm text-slate-600">{s.summary}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        {s.priceType === "fixed" ? (
          <>
            <p className="text-2xl font-bold">{money(s.priceCents)}</p>
            <AddToCart serviceId={s.id} />
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-500">Custom quote</p>
            <Link href={`/virtual-visit?topic=${encodeURIComponent(s.name)}`} className="btn btn-dark">Get a quote</Link>
          </>
        )}
      </div>
    </div>
  );
}

export default async function Home() {
  const settings = await getSettings();
  const { variant } = await getAttribution(settings);
  const headline = variant === "B" ? settings.heroHeadlineB : settings.heroHeadline;
  const sub = variant === "B" ? settings.heroSubB || settings.heroSub : settings.heroSub;
  const [services, plans] = await Promise.all([
    db().select().from(schema.services).where(eq(schema.services.active, true)).orderBy(asc(schema.services.sortOrder), asc(schema.services.name)),
    db().select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(asc(schema.plans.sortOrder)),
  ]);
  const categories = [...new Set(services.map((s) => s.category))];

  return (
    <>
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">Open 24/7 online</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight md:text-6xl">{headline}</h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">{sub}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="#services" className="btn btn-primary px-6 py-3 text-base">See services &amp; prices</Link>
            <Link href="/virtual-visit" className="btn bg-cream px-6 py-3 text-base text-black hover:bg-white">Book a virtual visit</Link>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-3">
          {[
            ["1. Choose", "Pick the service you need. Every fixed-price job shows its price."],
            ["2. Schedule", "Choose an arrival window that works for you from our live calendar."],
            ["3. Check out", "Confirm your details and pay securely. You're booked."],
          ].map(([t, d]) => (
            <div key={t}>
              <h2 className="font-semibold">{t}</h2>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="services" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-14">
        <h2 className="text-3xl font-bold tracking-tight">Services &amp; pricing</h2>
        {services.length === 0 && <p className="mt-4 text-slate-600">Services are being set up. Please check back soon.</p>}
        {categories.map((cat) => (
          <div key={cat} className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{cat}</h3>
            <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {services.filter((s) => s.category === cat).map((s) => <ServiceCard key={s.id} s={s} />)}
            </div>
          </div>
        ))}
      </section>

      {plans.length > 0 && (
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Maintenance plans</h2>
                <p className="mt-2 text-slate-600">Keep your generator ready for the next outage with scheduled service at a set price.</p>
              </div>
              <Link href="/plans" className="btn btn-ghost">Compare plans</Link>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {plans.slice(0, 3).map((p) => (
                <Link key={p.id} href={`/plans/${p.slug}`} className="card transition hover:border-ink">
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{p.summary}</p>
                  <p className="mt-3 text-2xl font-bold">{money(p.priceCents)}<span className="text-sm font-medium text-slate-500"> / {p.interval}</span></p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="rounded-2xl bg-brand p-8 text-black md:p-12">
          <h2 className="text-3xl font-bold tracking-tight">Thinking about a new generator?</h2>
          <p className="mt-3 max-w-2xl text-black/80">Start with a virtual visit. Show us your electrical panel and where the unit would sit, and we&apos;ll size it and prepare a quote without a site trip.</p>
          <Link href="/virtual-visit" className="btn btn-dark mt-6 px-6 py-3 text-base">Request a virtual visit</Link>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20">
        <h2 className="text-3xl font-bold tracking-tight">Common questions</h2>
        <div className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {faqs.map(([q, a]) => (
            <details key={q} className="group p-5">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="mr-2 inline-block text-brand-dark transition group-open:rotate-45">+</span>{q}
              </summary>
              <p className="mt-2 text-sm text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
