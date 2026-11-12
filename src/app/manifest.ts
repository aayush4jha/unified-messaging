import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbit",
    short_name: "Orbit",
    description: "One inbox. Every conversation. Every account. One workspace.",
    start_url: "/inbox",
    display: "standalone",
    background_color: "#faf9f7",
    theme_color: "#1c1b19",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
