import { redirect } from "next/navigation";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { login } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect("/admin");
  const { error } = await searchParams;
  return (
    <div className="grid flex-1 place-items-center px-4 py-16">
      <form action={login} className="card w-full max-w-sm">
        <h1 className="text-2xl font-bold">Admin sign in</h1>
        {!adminConfigured() ? (
          <p className="mt-3 text-sm text-slate-600">Admin access is switched off. Set <code>ADMIN_PASSWORD</code> (12+ characters) and <code>SESSION_SECRET</code> (32+ characters) in the environment, then restart.</p>
        ) : (
          <>
            {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error === "locked" ? "Too many attempts. Try again in 15 minutes." : "Wrong password."}</p>}
            <label className="mt-4 block">
              <span className="label">Password</span>
              <input className="input" type="password" name="password" required autoComplete="current-password" autoFocus />
            </label>
            <button className="btn btn-dark mt-4 w-full">Sign in</button>
          </>
        )}
      </form>
    </div>
  );
}
