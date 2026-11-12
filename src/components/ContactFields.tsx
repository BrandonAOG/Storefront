"use client";

export type Contact = { name: string; email: string; phone: string; address: string; city: string; zip: string };
export const emptyContact: Contact = { name: "", email: "", phone: "", address: "", city: "", zip: "" };

export function Field(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${props.className ?? ""}`}>
      <span className="label">{props.label}</span>
      {props.children}
    </label>
  );
}

export function ContactFields({ value, onChange }: { value: Contact; onChange: (c: Contact) => void }) {
  const set = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name"><input className="input" required autoComplete="name" maxLength={120} value={value.name} onChange={set("name")} /></Field>
      <Field label="Phone"><input className="input" required type="tel" autoComplete="tel" maxLength={30} value={value.phone} onChange={set("phone")} /></Field>
      <Field label="Email" className="sm:col-span-2"><input className="input" required type="email" autoComplete="email" maxLength={200} value={value.email} onChange={set("email")} /></Field>
      <Field label="Service address" className="sm:col-span-2"><input className="input" required autoComplete="street-address" maxLength={200} value={value.address} onChange={set("address")} /></Field>
      <Field label="City"><input className="input" required autoComplete="address-level2" maxLength={100} value={value.city} onChange={set("city")} /></Field>
      <Field label="ZIP code"><input className="input" required inputMode="numeric" autoComplete="postal-code" maxLength={10} value={value.zip} onChange={set("zip")} /></Field>
    </div>
  );
}

/** Hidden field real people never fill in; bots often do. */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="hidden" aria-hidden>
      <label>Website<input tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} /></label>
    </div>
  );
}

/** Texts are only sent to people who tick this box. */
export function SmsConsent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-4 flex items-start gap-2 text-sm text-slate-600">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>Text me updates about my appointment. Message and data rates may apply. Reply STOP to opt out.</span>
    </label>
  );
}
