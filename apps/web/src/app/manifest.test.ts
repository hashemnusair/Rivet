import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("member PWA manifest", () => {
  it("launches the member home as a standalone app", () => {
    expect(manifest()).toMatchObject({
      id: "/customer",
      start_url: "/customer/my-gyms",
      scope: "/",
      display: "standalone",
      background_color: "#f5f4ef",
      theme_color: "#f5f4ef",
      icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
    });
  });

  it("keeps every RIVET route inside the installed app scope", () => {
    const appManifest = manifest();
    const scope = appManifest.scope ?? "/customer/";

    for (const path of ["/customer/my-gyms", "/customer/discover", "/customer/profile", "/login"]) {
      expect(path.startsWith(scope)).toBe(true);
    }
  });
});
