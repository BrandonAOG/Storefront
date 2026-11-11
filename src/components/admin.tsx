const tones: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800",
  active: "bg-green-100 text-green-800",
  paid: "bg-green-100 text-green-800",
  completed: "bg-slate-200 text-slate-700",
  done: "bg-slate-200 text-slate-700",
  closed: "bg-slate-200 text-slate-700",
  pending: "bg-amber-100 text-amber-900",
  new: "bg-amber-100 text-amber-900",
  unpaid: "bg-amber-100 text-amber-900",
  scheduled: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-red-100 text-red-800",
};

export function Status({ value }: { value: string }) {
  return <span className={`badge ${tones[value] ?? "bg-slate-200 text-slate-700"}`}>{value}</span>;
}

export function Saved({ show }: { show: boolean }) {
  return show ? <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">Saved.</p> : null;
}

export function Select({ name, value, options }: { name: string; value: string; options: string[] }) {
  return (
    <select name={name} defaultValue={value} className="input">
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}
