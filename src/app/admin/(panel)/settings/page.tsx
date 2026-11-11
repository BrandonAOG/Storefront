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
        <button className="btn btn-dark sm:col-span-2">Save settings</button>
      </form>
    </>
  );
}
