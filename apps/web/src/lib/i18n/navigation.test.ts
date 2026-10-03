import { describe, expect, it } from "vitest";
import { createTranslator } from "./core";
import { localizeNavigationEntry, workspaceTargetCopy } from "./navigation";
import { parseWorkspaceSubtitle } from "../domain/workspace-subtitle";
import { NAVIGATION_ENTRIES, keywordSearchNavigation, permittedNavigationEntries } from "../../../convex/navigationCatalogue";
import { DEFAULT_ROLE_DEFINITIONS, PERMISSIONS } from "../../../convex/permissions";
import { navigationCatalogue } from "./messages/ar/navigationCatalogue";

const modules = ["revenue", "operations", "finance", "reporting"].map(key => ({ key, enabled: true, entitled: true }));
const owner = { permissions: [...PERMISSIONS], role: "owner", modules };
const ar = createTranslator("ar");

describe("bilingual navigation catalogue", () => {
  it("covers every current destination without changing the source or access contract", () => {
    const source = JSON.stringify(NAVIGATION_ENTRIES);
    expect(Object.keys(navigationCatalogue)).toHaveLength(NAVIGATION_ENTRIES.length);
    for (const entry of NAVIGATION_ENTRIES) {
      const translated = localizeNavigationEntry(ar, entry);
      expect(translated.label, entry.id).toMatch(/[\u0600-\u06ff]/);
      expect(translated.description, entry.id).toMatch(/[\u0600-\u06ff]/);
      expect({ ...translated, label: entry.label, description: entry.description, keywords: entry.keywords }).toEqual(entry);
    }
    expect(JSON.stringify(NAVIGATION_ENTRIES)).toBe(source);
  });

  it.each(["en", "ar"] as const)("accepts Arabic diacritics and English aliases in %s", locale => {
    const entries = permittedNavigationEntries(owner).map(entry => localizeNavigationEntry(createTranslator(locale), entry));
    expect(keywordSearchNavigation(entries, "أَنْوَاع الاشتراكات")[0]?.id).toBe("page.plans");
    expect(keywordSearchNavigation(entries, "الصِّيَانَة")[0]?.id).toBe("page.maintenance");
    expect(keywordSearchNavigation(entries, "maintenance").map(entry => entry.id)).toContain("page.maintenance");
    expect(keywordSearchNavigation(entries, "رَفْع قائمة المشتركين")[0]?.href).toBe("/members/import");
  });

  it("retains permission and disabled-module exclusions in Arabic search", () => {
    const entries = permittedNavigationEntries({ permissions: DEFAULT_ROLE_DEFINITIONS.receptionist.permissions, role: "receptionist", modules }).map(entry => localizeNavigationEntry(ar, entry));
    expect(keywordSearchNavigation(entries, "صلاحيات").map(entry => entry.id)).not.toContain("settings.roles");
    const disabled = permittedNavigationEntries({ ...owner, modules: modules.map(module => ({ ...module, enabled: module.key !== "operations" })) }).map(entry => localizeNavigationEntry(ar, entry));
    expect(keywordSearchNavigation(disabled, "مخزون").map(entry => entry.id)).not.toContain("page.operations");
  });

  it("projects known result facts and keeps authored or unknown history intact", () => {
    const lead = { kind: "lead" as const, id: "lead-1", title: "Lina — لينا", href: "/crm/leads/lead-1", subtitle: "offer_sent · +962790001234", subtitleParts: { kind: "lead" as const, stage: "offer_sent", phone: "+962790001234" } };
    expect(workspaceTargetCopy(ar, lead)).toMatchObject({ title: lead.title, subtitle: expect.stringContaining(ar("domain.leadStage.offer_sent")) });
    expect(workspaceTargetCopy(ar, lead).subtitle).toContain(lead.subtitleParts.phone);
    expect(lead.subtitle).toBe("offer_sent · +962790001234");
    const old = { kind: "lead" as const, id: "old", title: "Original person", href: "/crm/leads/old", subtitle: "Custom old text" };
    expect(workspaceTargetCopy(ar, old)).toEqual({ title: old.title, subtitle: old.subtitle });
    expect(parseWorkspaceSubtitle({ kind: "receipt", status: "completed" }, "lead")).toBeUndefined();
    const known = { kind: "page" as const, id: "page.plans", title: "Membership plans", href: "/plans", subtitle: "Original description" };
    expect(workspaceTargetCopy(ar, known).title).toBe("أنواع الاشتراكات");
    expect(workspaceTargetCopy(ar, { ...known, href: "/future" })).toEqual({ title: known.title, subtitle: known.subtitle });
  });
});
