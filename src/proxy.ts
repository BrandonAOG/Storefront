import { NextResponse, type NextRequest } from "next/server";

/**
 * Gives every storefront visitor an anonymous random id (first-party cookie).
 * It is used only to count the booking funnel and to pick an A/B variant; it
 * is never linked to a name until the visitor books, and holds no personal data.
 */
export function proxy(req: NextRequest) {
  if (req.cookies.get("aog_vid")) return NextResponse.next();
  const id = crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set("x-aog-vid", id); // lets this first request see the id too
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set("aog_vid", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const config = {
  // Storefront pages only: skip admin, API routes, Next internals and files.
  matcher: ["/((?!admin|api|_next|.*\\..*).*)"],
};
