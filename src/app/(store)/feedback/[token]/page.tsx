import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { FeedbackForm } from "@/components/FeedbackForm";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback", robots: { index: false } };

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const [f] = await db().select({ id: schema.feedback.id }).from(schema.feedback).where(eq(schema.feedback.token, token));
  if (!f) notFound();
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="card"><FeedbackForm token={token} reviewUrl={/^https:\/\//i.test(s.reviewUrl) ? s.reviewUrl : ""} /></div>
    </div>
  );
}
