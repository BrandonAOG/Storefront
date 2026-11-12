"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function track(type: "view" | "add_to_cart" | "checkout_start") {
  const q = new URLSearchParams(window.location.search);
  const body = JSON.stringify({
    type,
    path: window.location.pathname,
    utm_source: q.get("utm_source") ?? undefined,
    utm_medium: q.get("utm_medium") ?? undefined,
    utm_campaign: q.get("utm_campaign") ?? undefined,
    referrer: document.referrer || undefined,
  });
  // keepalive lets the request finish even if the visitor navigates away.
  fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/** Records one anonymous page view per storefront page. */
export function Tracker() {
  const pathname = usePathname();
  useEffect(() => {
    track("view");
  }, [pathname]);
  return null;
}
