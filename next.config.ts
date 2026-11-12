import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera, microphone, screen sharing and location are allowed for this site only (all used by the video call room, each with the person's permission).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Allows a service photo (up to 4 MB) to be uploaded from the admin form.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Never let a shared cache keep admin or order pages.
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // Private customer links: never cached, never indexed.
      ...["order", "quote", "visit", "call", "feedback", "unsubscribe", "plans/thanks"].map((p) => ({
        source: `/${p}/:path*`,
        headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex" }, { key: "Referrer-Policy", value: "no-referrer" }],
      })),
      { source: "/api/v1/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
