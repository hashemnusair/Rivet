import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { offlineDocument } from "@/lib/public/offline-document";

const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

function worker() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const records = new Map<string, Response>([["/offline", new Response(offlineDocument("en"))]]);
  const cache = {
    match: async (key: string) => records.get(key)?.clone(),
    put: async (key: string, value: Response) => { records.set(key, value); },
    addAll: vi.fn(),
  };
  vm.runInNewContext(source, {
    self: { location: { origin: "https://rivet.example" }, addEventListener: (name: string, listener: typeof listeners[string]) => { listeners[name] = listener; } },
    caches: { open: async () => cache },
    fetch: async () => { throw new Error("Offline"); },
    Response, URL,
  });
  return { records, listeners };
}

describe("member service-worker privacy and language policy", () => {
  it("precaches only the public offline shell and brand assets", () => {
    expect(source).toContain('const PUBLIC_SHELL = ["/offline", "/brand/rivet-glyph.png", "/icon.png"]');
    expect(source).not.toMatch(/PUBLIC_SHELL[^;]*(receipt|entry|finance|my-gyms)/i);
    const html = offlineDocument("ar");
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("أعد الاتصال لفتح RIVET");
    expect(html).not.toMatch(/<script|__next|clerk|initialOwner|token/i);
  });

  it("applies the last explicit presentation language before serving an offline navigation", async () => {
    const { records, listeners } = worker();
    let pending: Promise<unknown> = Promise.resolve();
    const waitUntil = (value: Promise<unknown>) => { pending = value; };
    listeners.message!({ data: { type: "rivet:ui-locale", locale: "ar", owner: "must-not-be-saved" }, waitUntil });
    await pending;
    expect(await records.get("/_rivet/offline-language")?.clone().text()).toBe("ar");
    let response: Promise<Response> | undefined;
    listeners.fetch!({ request: { method: "GET", url: "https://rivet.example/customer/my-gyms", mode: "navigate" }, respondWith: (value: Promise<Response>) => { response = value; } });
    expect(await (await response)?.text()).toContain('<html lang="ar" dir="rtl">');
    expect([...records.keys()]).toEqual(["/offline", "/_rivet/offline-language"]);

    listeners.message!({ data: { type: "rivet:ui-locale", locale: "en" }, waitUntil });
    await pending;
    listeners.fetch!({ request: { method: "GET", url: "https://rivet.example/customer/profile", mode: "navigate" }, respondWith: (value: Promise<Response>) => { response = value; } });
    expect(await (await response)?.text()).toContain('<html lang="en" dir="ltr">');
  });

  it("ignores invalid locale messages and does not intercept data writes", async () => {
    const { records, listeners } = worker();
    const waitUntil = vi.fn(), respondWith = vi.fn();
    listeners.message!({ data: { type: "rivet:ui-locale", locale: '<script>' }, waitUntil });
    listeners.fetch!({ request: { method: "POST", url: "https://rivet.example/api/customer" }, respondWith });
    expect(waitUntil).not.toHaveBeenCalled(); expect(respondWith).not.toHaveBeenCalled();
    expect([...records.keys()]).toEqual(["/offline"]);
  });
});
