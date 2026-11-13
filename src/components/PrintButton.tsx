"use client";

export function PrintButton({ children }: { children: React.ReactNode }) {
  return <button type="button" className="btn btn-primary px-6 py-3 text-base" onClick={() => window.print()}>{children}</button>;
}
