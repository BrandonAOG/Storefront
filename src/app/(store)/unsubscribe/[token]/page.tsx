import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Unsubscribe } from "@/components/Unsubscribe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email preferences", robots: { index: false } };

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const [c] = await db().select({ out: schema.customers.emailOptOut }).from(schema.customers).where(eq(schema.customers.token, token));
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="card"><Unsubscribe token={token} initial={c.out} /></div>
    </div>
  );
}
