import { Saved } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { stripeEnabled } from "@/lib/stripe";
import { saveSettings } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SettingsAdmin({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const s = await getSettings();
  return (
    <>
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="mt-4"><Saved show={(await searchParams).saved === "1"} /></div>
      <form action={saveSettings} className="card grid max-w-2xl gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="label">Business name</span><input className="input" name="businessName" maxLength={120} defaultValue={s.businessName} /></label>
        <label><span className="label">Phone shown to customers</span><input className="input" name="phone" maxLength={30} defaultValue={s.phone} /></label>
        <label><span className="label">Email shown to customers</span><input className="input" name="email" type="email" maxLength={200} defaultValue={s.email} /></label>
        <label className="sm:col-span-2">
          <span className="label">Service area ZIP codes</span>
          <textarea className="input" name="serviceZips" rows={4} defaultValue={s.serviceZips} placeholder="34102, 34103, 34108 …" />
          <span className="mt-1 block text-xs text-slate-500">Separate with commas or spaces. Leave empty to accept any ZIP code.</span>
        </label>
        <label className="sm:col-span-2">
          <span className="label">Charged at checkout (%)</span>
          <input className="input max-w-32" type="number" name="depositPercent" min={0} max={100} defaultValue={s.depositPercent} />
          <span className="mt-1 block text-xs text-slate-500">100 = pay in full. Lower takes a deposit and leaves the rest due at service. 0 = no online payment. {!stripeEnabled() && "Stripe isn't connected yet, so nothing is charged online regardless of this value."}</span>
        </label>
        <label><span className="label">Send new-booking alerts to</span><input className="input" name="notifyEmail" type="email" maxLength={200} defaultValue={s.notifyEmail} placeholder="you@example.com" /></label>
        <label><span className="label">Public review page (https://…)</span><input className="input" name="reviewUrl" type="url" maxLength={500} defaultValue={s.reviewUrl} placeholder="Your Google review link" /></label>
        <label className="sm:col-span-2">
          <span className="label">Mailing address (shown at the bottom of reminder and offer emails)</span>
          <input className="input" name="mailingAddress" maxLength={300} defaultValue={s.mailingAddress} />
          <span className="mt-1 block text-xs text-slate-500">US law (CAN-SPAM) requires a postal address in marketing email.</span>
        </label>

        <h2 className="mt-2 border-t border-slate-200 pt-4 font-bold sm:col-span-2">Home page headline</h2>
        <label className="sm:col-span-2"><span className="label">Headline</span><input className="input" name="heroHeadline" maxLength={160} defaultValue={s.heroHeadline} /></label>
        <label className="sm:col-span-2"><span className="label">Line under the headline</span><input className="input" name="heroSub" maxLength={300} defaultValue={s.heroSub} /></label>
        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" name="abEnabled" defaultChecked={s.abEnabled} /> Run an A/B test: show half of visitors the alternative below</label>
        <label className="sm:col-span-2"><span className="label">Alternative headline (B)</span><input className="input" name="heroHeadlineB" maxLength={160} defaultValue={s.heroHeadlineB} /></label>
        <label className="sm:col-span-2">
          <span className="label">Alternative line under the headline (B)</span>
          <input className="input" name="heroSubB" maxLength={300} defaultValue={s.heroSubB} />
          <span className="mt-1 block text-xs text-slate-500">Results appear in Analytics. The test only runs while the box is ticked and headline B is filled in.</span>
        </label>
        <button className="btn btn-dark sm:col-span-2">Save settings</button>
      </form>
    </>
  );
}
