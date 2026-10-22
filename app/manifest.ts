import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HistoPath Companion",
    short_name: "HistoPath",
    description: "Private voice-first histopathology case companion",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F5FB",
    theme_color: "#3D3A8C",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
