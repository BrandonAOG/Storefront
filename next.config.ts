import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
      ...["order", "quote", "visit", "feedback", "unsubscribe", "plans/thanks"].map((p) => ({
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
