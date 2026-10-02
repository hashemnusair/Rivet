import { describe, expect, it } from "vitest";
import { memberManifest } from "./manifest";
import { vi } from "vitest";
vi.mock("@/lib/i18n/server", () => ({ getRequestLocale: async () => "en" }));
const manifest = () => memberManifest("en");

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

  it("offers shortcuts for entry, payments, memberships, and PT", () => {
    expect(manifest().shortcuts?.map((shortcut) => shortcut.url)).toEqual([
      "/customer/my-gyms",
      "/customer/my-gyms?entry=1",
      "/customer/finance",
      "/customer/my-gyms?section=pt",
    ]);
  });
});

it("localizes install labels without changing scope, identity or deep links", () => {
  const en = memberManifest("en"), ar = memberManifest("ar");
  expect(ar.lang).toBe("ar"); expect(ar.dir).toBe("rtl");
  expect(ar.name).toBe("RIVET للأعضاء");
  expect(ar.id).toBe(en.id); expect(ar.scope).toBe(en.scope); expect(ar.start_url).toBe(en.start_url);
  expect(ar.shortcuts?.map(shortcut => shortcut.url)).toEqual(en.shortcuts?.map(shortcut => shortcut.url));
});
