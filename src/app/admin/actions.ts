"use server";

import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { endSession, passwordMatches, requireAdmin, startSession } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { parseZips } from "@/lib/settings";

// Every action below (except login) starts with requireAdmin(): server actions
// are reachable by direct POST, so the page-level check alone is not enough.

const str = (fd: FormData, key: string, max = 500) => String(fd.get(key) ?? "").trim().slice(0, max);
const int = (fd: FormData, key: string, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(String(fd.get(key) ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const cents = (fd: FormData, key: string) => {
  const n = Number.parseFloat(String(fd.get(key) ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.min(100_000_000, Math.max(0, Math.round(n * 100))) : 0;
};
const minutes = (fd: FormData, key: string, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(fd.get(key) ?? ""));
  return m ? Math.min(1440, Number(m[1]) * 60 + Number(m[2])) : fallback;
};
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export async function login(fd: FormData) {
  if (!(await rateLimit("login", 5, 900))) redirect("/admin/login?error=locked");
  if (!passwordMatches(String(fd.get("password") ?? ""))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    redirect("/admin/login?error=1");
  }
  await startSession();
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

export async function saveSettings(fd: FormData) {
  await requireAdmin();
  await db()
    .update(schema.settings)
    .set({
      businessName: str(fd, "businessName", 120) || "Always On Generators",
      phone: str(fd, "phone", 30),
      email: str(fd, "email", 200),
      serviceZips: parseZips(str(fd, "serviceZips", 20000)).join(", "),
      depositPercent: int(fd, "depositPercent", 0, 100, 100),
    })
    .where(eq(schema.settings.id, 1));
  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=1");
}

export async function saveScheduling(fd: FormData) {
  await requireAdmin();
  await db()
    .update(schema.settings)
    .set({
      slotMinutes: int(fd, "slotMinutes", 30, 720, 120),
      slotCapacity: int(fd, "slotCapacity", 1, 50, 1),
      leadDays: int(fd, "leadDays", 0, 60, 1),
      horizonDays: int(fd, "horizonDays", 1, 180, 30),
    })
    .where(eq(schema.settings.id, 1));
  for (let weekday = 0; weekday < 7; weekday++) {
    const startMin = minutes(fd, `start-${weekday}`, 480);
    const endMin = Math.max(startMin, minutes(fd, `end-${weekday}`, 960));
    const row = { weekday, open: fd.get(`open-${weekday}`) === "on", startMin, endMin };
    await db().insert(schema.hours).values(row).onConflictDoUpdate({ target: schema.hours.weekday, set: row });
  }
  redirect("/admin/availability?saved=1");
}

export async function addBlackout(fd: FormData) {
  await requireAdmin();
  const day = str(fd, "day", 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    await db().insert(schema.blackouts).values({ day, note: str(fd, "note", 120) }).onConflictDoNothing();
  }
  redirect("/admin/availability");
}

export async function removeBlackout(fd: FormData) {
  await requireAdmin();
  await db().delete(schema.blackouts).where(eq(schema.blackouts.day, str(fd, "day", 10)));
  redirect("/admin/availability");
}

async function uniqueSlug(table: typeof schema.services | typeof schema.plans, wanted: string, selfId: number | null) {
  const base = wanted || "item";
  const clash = await db()
    .select({ id: table.id })
    .from(table)
    .where(selfId ? and(eq(table.slug, base), ne(table.id, selfId)) : eq(table.slug, base));
  return clash.length ? `${base}-${randomBytes(2).toString("hex")}` : base;
}

export async function saveService(fd: FormData) {
  await requireAdmin();
  const id = int(fd, "id", 0, 2 ** 31 - 1, 0) || null;
  const name = str(fd, "name", 120);
  if (!name) redirect(id ? `/admin/services/${id}?error=name` : "/admin/services/new?error=name");
  const values = {
    name,
    slug: await uniqueSlug(schema.services, slugify(str(fd, "slug", 80) || name), id),
    category: str(fd, "category", 60) || "Service",
    summary: str(fd, "summary", 300),
    description: str(fd, "description", 5000),
    priceType: fd.get("priceType") === "quote" ? "quote" : "fixed",
    priceCents: cents(fd, "price"),
    active: fd.get("active") === "on",
    sortOrder: int(fd, "sortOrder", -1000, 1000, 0),
  };
  if (id) await db().update(schema.services).set(values).where(eq(schema.services.id, id));
  else await db().insert(schema.services).values(values);
  redirect("/admin/services");
}

export async function deleteService(fd: FormData) {
  await requireAdmin();
  await db().delete(schema.services).where(eq(schema.services.id, int(fd, "id", 0, 2 ** 31 - 1, 0)));
  redirect("/admin/services");
}

export async function savePlan(fd: FormData) {
  await requireAdmin();
  const id = int(fd, "id", 0, 2 ** 31 - 1, 0) || null;
  const name = str(fd, "name", 120);
  if (!name) redirect(id ? `/admin/plans/${id}?error=name` : "/admin/plans/new?error=name");
  const values = {
    name,
    slug: await uniqueSlug(schema.plans, slugify(str(fd, "slug", 80) || name), id),
    summary: str(fd, "summary", 300),
    features: str(fd, "features", 3000),
    priceCents: cents(fd, "price"),
    interval: fd.get("interval") === "month" ? "month" : "year",
    active: fd.get("active") === "on",
    sortOrder: int(fd, "sortOrder", -1000, 1000, 0),
  };
  if (id) await db().update(schema.plans).set(values).where(eq(schema.plans.id, id));
  else await db().insert(schema.plans).values(values);
  redirect("/admin/plans");
}

export async function deletePlan(fd: FormData) {
  await requireAdmin();
  await db().delete(schema.plans).where(eq(schema.plans.id, int(fd, "id", 0, 2 ** 31 - 1, 0)));
  redirect("/admin/plans");
}

const uuid = z.string().uuid();

export async function updateOrder(fd: FormData) {
  await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  const status = z.enum(["pending", "confirmed", "completed", "cancelled"]).parse(fd.get("status"));
  const paymentStatus = z.enum(["unpaid", "paid", "refunded"]).parse(fd.get("paymentStatus"));
  await db().update(schema.orders).set({ status, paymentStatus }).where(eq(schema.orders.id, id));
  redirect(`/admin/orders/${id}?saved=1`);
}

export async function updateVisit(fd: FormData) {
  await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  const status = z.enum(["new", "scheduled", "done", "closed"]).parse(fd.get("status"));
  // Only https links are stored, so the link can never be a javascript: URL.
  const url = str(fd, "meetingUrl", 500);
  const meetingUrl = /^https:\/\/[^\s]+$/i.test(url) ? url : "";
  await db().update(schema.visits).set({ status, meetingUrl, adminNotes: str(fd, "adminNotes", 2000) }).where(eq(schema.visits.id, id));
  redirect("/admin/visits");
}

export async function updateMembership(fd: FormData) {
  await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  const status = z.enum(["pending", "active", "cancelled"]).parse(fd.get("status"));
  await db().update(schema.memberships).set({ status }).where(eq(schema.memberships.id, id));
  redirect("/admin/memberships");
}
