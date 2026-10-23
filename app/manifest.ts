import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HistoPath Companion",
    short_name: "HistoPath",
    description: "Private voice-first histopathology case companion",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F6F5FB",
    theme_color: "#3D3A8C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
