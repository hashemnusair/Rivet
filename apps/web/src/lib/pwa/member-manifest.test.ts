import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LAUNCH_MARK_HEIGHT, LAUNCH_SCREENS, LAUNCH_STARTUP_IMAGES, launchImageMedia, launchImagePath, launchMarkCentre } from "./launch-images";
import { MEMBER_APP_METADATA, MEMBER_MANIFEST_PATH, memberManifest } from "./member-manifest";

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
    expect(read("src/app/layout.tsx")).not.toMatch(/manifest/);
    expect(MEMBER_APP_METADATA.manifest).toBe(MEMBER_MANIFEST_PATH);
    expect(read("src/app/customer/layout.tsx")).toContain("metadata: Metadata = MEMBER_APP_METADATA");
    expect(read("src/app/login/member/layout.tsx")).toContain("metadata: Metadata = MEMBER_APP_METADATA");
  });
});

describe("member app launch images", () => {
  it("has an image of the right size for every listed iPhone, matched by its screen", () => {
    expect(MEMBER_APP_METADATA.appleWebApp).toMatchObject({ capable: true, statusBarStyle: "default", startupImage: LAUNCH_STARTUP_IMAGES });
    expect(new Set(LAUNCH_SCREENS.map(launchImageMedia)).size).toBe(LAUNCH_SCREENS.length);
    for (const screen of LAUNCH_SCREENS) {
      const png = readFileSync(resolve(process.cwd(), `public${launchImagePath(screen)}`));
      // PNG IHDR: width and height are the big-endian words at bytes 16 and 20.
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], screen.devices).toEqual([screen.width * screen.pixelRatio, screen.height * screen.pixelRatio]);
      expect(launchImageMedia(screen)).toBe(`(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.pixelRatio}) and (orientation: portrait)`);
    }
  });

  it("puts the mark where the opening curtain draws it: centred below the status bar", () => {
    expect(launchMarkCentre({ width: 393, height: 852, pixelRatio: 3, statusBar: 59, devices: "" })).toEqual({ x: 196.5, y: 455.5 });
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
    // The curtain's mark is h-14 (3.5rem = LAUNCH_MARK_HEIGHT) and the root keeps the same status bar.
    expect(LAUNCH_MARK_HEIGHT).toBe(56);
    expect(read("src/components/motion/workspace-curtain.tsx")).toContain('className="h-14 w-auto text-ink"');
    expect(read("src/app/layout.tsx")).toContain('statusBarStyle: "default"');
  });
});

it("localizes install labels without changing scope, identity or deep links", () => {
  const en = memberManifest("en"), ar = memberManifest("ar");
  expect(ar.lang).toBe("ar"); expect(ar.dir).toBe("rtl");
  expect(ar.name).toBe("RIVET للأعضاء");
  expect(ar.id).toBe(en.id); expect(ar.scope).toBe(en.scope); expect(ar.start_url).toBe(en.start_url);
  expect(ar.shortcuts?.map(shortcut => shortcut.url)).toEqual(en.shortcuts?.map(shortcut => shortcut.url));
});
