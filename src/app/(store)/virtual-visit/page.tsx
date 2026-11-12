import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { VisitForm } from "@/components/VisitForm";
import { todayLocal } from "@/lib/slots";

export const dynamic = "force-dynamic";
export const metadata = { title: "Virtual visit" };

export default async function VirtualVisitPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const quoteServices = await db()
    .select({ name: schema.services.name })
    .from(schema.services)
    .where(and(eq(schema.services.active, true), eq(schema.services.priceType, "quote")))
    .orderBy(asc(schema.services.sortOrder));
  const topics = quoteServices.map((s) => s.name);
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 lg:grid-cols-2">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Book a virtual visit</h1>
        <p className="mt-3 text-lg text-slate-600">A short video or phone call with one of our generator specialists. No truck in the driveway, no waiting around.</p>
        <ul className="mt-6 space-y-4 text-sm text-slate-700">
          <li><strong className="block text-base text-slate-900">1. Tell us what you need</strong>Send the form and we&apos;ll confirm a time that suits you.</li>
          <li><strong className="block text-base text-slate-900">2. Show us your setup</strong>Walk us through your electrical panel, meter and where the generator would go.</li>
          <li><strong className="block text-base text-slate-900">3. Get your quote</strong>We size the system and send you a written quote.</li>
        </ul>
      </div>
      <VisitForm topics={topics} initialTopic={topic && topics.includes(topic) ? topic : ""} minDay={todayLocal()} uploads={Boolean(process.env.BLOB_READ_WRITE_TOKEN)} />
    </div>
  );
}
