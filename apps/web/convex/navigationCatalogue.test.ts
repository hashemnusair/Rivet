import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_DEFINITIONS, PERMISSIONS } from "./permissions";
import {
  NAVIGATION_ENTRIES,
  keywordSearchNavigation,
  permittedNavigationEntries,
  reportEntries,
  type NavigationAccess,
} from "./navigationCatalogue";

const allModules = ["revenue", "operations", "finance", "reporting"].map((key) => ({ key, entitled: true, enabled: true }));
const owner: NavigationAccess = { permissions: [...PERMISSIONS], role: "owner", modules: allModules };
const receptionist: NavigationAccess = { permissions: DEFAULT_ROLE_DEFINITIONS.receptionist.permissions, role: "receptionist", modules: allModules };
const ids = (entries: ReadonlyArray<{ id: string }>) => entries.map((entry) => entry.id);

describe("navigation catalogue integrity", () => {
  it("has unique ids, routes that exist, settings sections that exist and permissions from the server catalogue", () => {
    expect(new Set(ids(NAVIGATION_ENTRIES)).size).toBe(NAVIGATION_ENTRIES.length);
    const settingsSource = readFileSync(join(__dirname, "..", "src", "features", "settings", "settings-page-inner.tsx"), "utf8");
    const sectionIds = new Set([...settingsSource.matchAll(/\{ id: "([a-z_-]+)", label:/g)].map((match) => match[1]));
    for (const entry of NAVIGATION_ENTRIES) {
      const [path, query] = entry.href.split("?");
      expect(existsSync(join(__dirname, "..", "src", "app", "(app)", path!.slice(1), "page.tsx")), `${entry.id} points at ${path}`).toBe(true);
      expect(entry.description.length, entry.id).toBeGreaterThan(20);
      expect(entry.keywords.length, entry.id).toBeGreaterThan(0);
      for (const permission of entry.anyPermission ?? []) expect(PERMISSIONS, `${entry.id} uses ${permission}`).toContain(permission);
      if (entry.kind === "settings") expect(sectionIds.has(new URLSearchParams(query).get("section") ?? ""), `${entry.id} names a Settings section`).toBe(true);
    }
  });

  it("filters by permission, role-independent module status and keeps the catalogue deterministic", () => {
    const ownerIds = ids(permittedNavigationEntries(owner));
    expect(ownerIds).toEqual(expect.arrayContaining(["settings.roles", "page.audit", "page.checkout", "report.controls", "form.supplier.payment"]));
    const receptionIds = ids(permittedNavigationEntries(receptionist));
    expect(receptionIds).toEqual(expect.arrayContaining(["page.reception", "form.checkin.start", "form.payment.collect", "page.payments.shifts", "page.members"]));
    expect(receptionIds).not.toEqual(expect.arrayContaining(["settings.roles"]));
    expect(receptionIds).not.toContain("page.audit");
    expect(receptionIds).not.toContain("report.controls");
    expect(receptionIds).not.toContain("form.supplier.payment");
    const noOperations = permittedNavigationEntries({ ...owner, modules: allModules.map((module) => (module.key === "operations" ? { ...module, enabled: false } : module)) });
    expect(ids(noOperations)).not.toContain("page.checkout");
    expect(ids(noOperations)).not.toContain("form.supplier.payment");
    expect(ids(noOperations)).toContain("page.members");
    expect(ids(permittedNavigationEntries({ ...owner, modules: undefined }))).toContain("page.checkout");
  });

  it("keeps the fast keyword search exact-first and permission-bound", () => {
    const entries = permittedNavigationEntries(owner);
    expect(keywordSearchNavigation(entries, "Members")[0]?.id).toBe("page.members");
    expect(ids(keywordSearchNavigation(entries, "refund"))).toEqual(expect.arrayContaining(["settings.roles", "report.controls"]));
    expect(ids(keywordSearchNavigation(entries, "csv"))).toEqual(expect.arrayContaining(["form.members.import", "page.exports"]));
    expect(ids(keywordSearchNavigation(permittedNavigationEntries(receptionist), "refund"))).not.toContain("settings.roles");
    expect(keywordSearchNavigation(entries, "x")).toEqual([]);
  });

  it("keeps report views in the catalogue without choosing dates or branches", () => {
    const reports = reportEntries(permittedNavigationEntries(owner));
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((entry) => entry.id.startsWith("report."))).toBe(true);
    expect(reports.some((entry) => entry.id === "report.collections")).toBe(true);
  });
});
