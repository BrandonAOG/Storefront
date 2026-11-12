import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Service } from "@/db/schema";
import { AddToCart } from "@/components/Cart";
import { BRAND } from "@/lib/brand";
import { money, NO_PRICE } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getAttribution } from "@/lib/visitor";

export const dynamic = "force-dynamic";

const faqs = [
  ["How does pricing work?", "Maintenance and repair visits are booked online, and we confirm the price with you before any work begins. Installations and electrical projects start with a free estimate and a clear, flat quote."],
  ["Do I have to call to book?", "No. Choose your service, pick an arrival window and confirm. You'll get a confirmation page with your booking details right away."],
  ["What if it's an emergency?", "Don't wait for an online booking. Call our 24/7 emergency line for immediate dispatch."],
  ["Which brands do you service?", "Generac, Kohler, Cummins and other major generator brands, whether or not we installed the unit."],
  ["What is a virtual visit?", "A short video or phone consultation. We look at your electrical panel and where the generator would sit, then prepare your estimate without a site trip first."],
  ["Do you offer financing?", "Yes. Generator financing is available through the Synchrony Project Card. Checking whether you prequalify does not affect your credit score."],
  ["How do maintenance plans work?", "Choose Standard, Deluxe or Always On. Every plan includes scheduled maintenance and electronic monitoring between visits, and higher levels add more frequent wellness visits."],
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {s.priceType === "fixed" ? (
          <>
            {s.priceCents > 0 ? <p className="text-2xl font-bold">{money(s.priceCents)}</p> : <p className="text-sm font-semibold text-slate-500">{NO_PRICE}</p>}
            <AddToCart serviceId={s.id} />
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-500">Free estimate</p>
            <Link href={`/virtual-visit?topic=${encodeURIComponent(s.name)}`} className="btn btn-dark">Free estimate</Link>
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
        <div className="mx-auto max-w-4xl px-4 py-14 text-center md:py-20">
          <p className="font-display text-sm font-extrabold uppercase tracking-wide text-brand sm:text-xl">{BRAND.tagline}</p>
          <p className="glow-text mt-3 text-5xl leading-none sm:text-6xl md:text-7xl" aria-hidden>{BRAND.glow}</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-xl font-extrabold tracking-tight sm:text-2xl md:text-3xl">{headline}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">{sub}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="#services" className="btn btn-primary px-6 py-3 text-base">Book service</Link>
            <Link href="/virtual-visit" className="btn bg-cream px-6 py-3 text-base text-black hover:bg-white">Free estimate</Link>
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold text-cream">
            {BRAND.badges.map((b) => <li key={b} className="flex items-center gap-2"><span className="text-brand" aria-hidden>✓</span>{b}</li>)}
          </ul>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-3">
          {[
            ["1. Choose", "Pick maintenance or repair to book a visit, or ask for a free estimate on a new project."],
            ["2. Schedule", "Choose an arrival window that works for you from our live calendar."],
            ["3. Confirm", "Add your details and you're booked. We confirm pricing before any work begins."],
          ].map(([t, d]) => (
            <div key={t}>
              <h2 className="font-semibold">{t}</h2>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="services" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-14">
        <h2 className="text-3xl font-bold tracking-tight">Our services</h2>
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
                <p className="mt-2 text-slate-600">Every plan includes scheduled maintenance and electronic monitoring between visits.</p>
              </div>
              <Link href="/plans" className="btn btn-ghost">Compare plans</Link>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {plans.slice(0, 3).map((p) => (
                <Link key={p.id} href={`/plans/${p.slug}`} className="card transition hover:border-ink">
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{p.summary}</p>
                  <p className="mt-3 text-2xl font-bold">{p.priceCents > 0 ? <>{money(p.priceCents)}<span className="text-sm font-medium text-slate-500"> / {p.interval}</span></> : <span className="text-base">Call for pricing</span>}</p>
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

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-bold tracking-tight">Serving Southwest Florida</h2>
          <ul className="mt-4 flex flex-wrap gap-2 text-sm">
            {BRAND.cities.map((c) => <li key={c} className="rounded-full bg-cream px-3 py-1 font-semibold">{c}</li>)}
          </ul>
          <p className="mt-4 text-sm text-slate-600">Thinking about the cost of a new generator? <a className="font-semibold underline" href={BRAND.financing}>See financing options</a>.</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 pb-20">
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
