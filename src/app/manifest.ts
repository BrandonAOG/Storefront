import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/** Lets customers add the storefront to their phone's home screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Always On Generators",
    short_name: "Always On",
    description: "Book generator service and request estimates online.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#231f20",
    icons: [{ src: BRAND.icon, sizes: "192x192", type: "image/png" }],
  };
}
