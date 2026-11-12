import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CustomerRoom } from "@/components/call/CustomerRoom";
import { iceServers } from "@/lib/call";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your virtual visit", robots: { index: false } };

export default async function CustomerCall({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const [v] = await db().select({ name: schema.visits.name, status: schema.visits.status }).from(schema.visits).where(eq(schema.visits.token, token));
  if (!v || (v.status !== "new" && v.status !== "scheduled")) notFound();
  const s = await getSettings();
  return (
    <div className="min-h-dvh bg-ink">
      <CustomerRoom token={token} business={s.businessName} firstName={v.name.split(" ")[0]} iceServers={iceServers()} />
    </div>
  );
}
