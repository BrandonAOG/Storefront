import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BookingWizard } from "@/components/BookingWizard";
import { getSettings, parseZips } from "@/lib/settings";
import { stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book service" };

export default async function BookPage() {
  const [s, services] = await Promise.all([
    getSettings(),
    db()
      .select({ id: schema.services.id, name: schema.services.name, summary: schema.services.summary, priceCents: schema.services.priceCents, zips: schema.services.zips })
      .from(schema.services)
      .where(and(eq(schema.services.active, true), eq(schema.services.priceType, "fixed")))
      .orderBy(asc(schema.services.sortOrder)),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Book your service</h1>
      <BookingWizard
        services={services.map((x) => ({ ...x, zips: parseZips(x.zips) }))}
        serviceZips={parseZips(s.serviceZips)}
        depositPercent={s.depositPercent}
        payOnline={stripeEnabled() && s.depositPercent > 0}
      />
    </div>
  );
}
