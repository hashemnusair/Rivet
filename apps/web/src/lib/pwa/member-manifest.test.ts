import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { memberManifest } from "./member-manifest";

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
    });
  });

  it("ships launcher icons in both sizes, with a mask-safe pair for Android", () => {
    const icons = manifest().icons ?? [];
    for (const purpose of ["any", "maskable"]) {
      expect(icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes).sort()).toEqual(["192x192", "512x512"]);
    }
    for (const icon of icons) {
      const file = icon.src === "/icon.png" ? "src/app/icon.png" : `public${icon.src}`;
      expect(existsSync(resolve(process.cwd(), file)), file).toBe(true);
    }
    expect(existsSync(resolve(process.cwd(), "src/app/apple-icon.png"))).toBe(true);
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

  it("lists itself as a related app on the host that served it", () => {
    expect(manifest().related_applications).toBeUndefined();
    expect(memberManifest("en", "https://app.rivetjo.com").related_applications).toEqual([
      { platform: "webapp", url: "https://app.rivetjo.com/manifest.webmanifest" },
    ]);
  });

  it("is linked from member pages only, never from the root layout", () => {
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
    expect(existsSync(resolve(process.cwd(), "src/app/manifest.ts"))).toBe(false);
    for (const file of ["src/app/root-document.tsx", "src/app/(main)/layout.tsx", "src/app/(site)/[lang]/layout.tsx"]) expect(read(file)).not.toMatch(/manifest/);
    expect(read("src/app/(main)/customer/layout.tsx")).toContain("manifest: MEMBER_MANIFEST_PATH");
    expect(read("src/app/(main)/login/member/layout.tsx")).toContain("manifest: MEMBER_MANIFEST_PATH");
  });
});

it("localizes install labels without changing scope, identity or deep links", () => {
  const en = memberManifest("en"), ar = memberManifest("ar");
  expect(ar.lang).toBe("ar"); expect(ar.dir).toBe("rtl");
  expect(ar.name).toBe("RIVET للأعضاء");
  expect(ar.id).toBe(en.id); expect(ar.scope).toBe(en.scope); expect(ar.start_url).toBe(en.start_url);
  expect(ar.shortcuts?.map(shortcut => shortcut.url)).toEqual(en.shortcuts?.map(shortcut => shortcut.url));
});
