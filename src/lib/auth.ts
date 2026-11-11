import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "aog_admin";
const MAX_AGE = 60 * 60 * 12; // 12 hours

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

export function adminConfigured(): boolean {
  return Boolean(secret() && process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 12);
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so both buffers are the same length and length is not leaked.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passwordMatches(input: string): boolean {
  if (!adminConfigured()) return false;
  return safeEqual(input, process.env.ADMIN_PASSWORD!);
}

export async function startSession() {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET is not set");
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp, key)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).set(COOKIE, "", { path: "/admin", maxAge: 0 });
}

export async function isAdmin(): Promise<boolean> {
  const key = secret();
  if (!key) return false;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [exp, mac] = raw.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp)) return false;
  if (!safeEqual(mac, sign(exp, key))) return false;
  return Number(exp) > Math.floor(Date.now() / 1000);
}

/** Call at the top of every admin page AND every admin server action. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
