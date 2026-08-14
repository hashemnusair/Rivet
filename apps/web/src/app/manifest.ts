import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/customer",
    name: "RIVET Member",
    short_name: "RIVET",
    description: "Your RIVET memberships, entry passes, visits, and gym discovery.",
    start_url: "/customer/my-gyms",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f5f4ef",
    theme_color: "#f5f4ef",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    launch_handler: {
      client_mode: "navigate-existing",
    },
  };
}
