import type { MetadataRoute } from "next";

// Web app manifest — makes NotJust OS installable to a phone home screen
// with a proper icon + name instead of the auto-generated gray "N" box.
// Served by Next at /manifest.webmanifest and auto-linked from <head>.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NotJust OS",
    short_name: "NotJust OS",
    description: "Operating system for NotJust Enterprises Inc.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#E89F8F",
    theme_color: "#E89F8F",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
