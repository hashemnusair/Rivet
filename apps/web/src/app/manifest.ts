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
    shortcuts: [
      { name: "My memberships", short_name: "Memberships", url: "/customer/my-gyms", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }] },
      { name: "Entry QR", short_name: "Entry QR", url: "/customer/my-gyms?entry=1", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }] },
      { name: "Payments and receipts", short_name: "Payments", url: "/customer/finance", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }] },
      { name: "Personal training", short_name: "PT", url: "/customer/my-gyms?section=pt", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }] },
    ],
    launch_handler: {
      client_mode: "navigate-existing",
    },
  };
}
