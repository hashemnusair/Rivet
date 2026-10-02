import { describe, expect, it } from "vitest";
import { PERMISSIONS, PERMISSION_LABELS, defaultRoleDefinitions } from "../domain/permissions";
import { createTranslator } from "./core";
import { knownPermissionCopy, permissionCopy } from "./permissions";

describe("translated permission catalogue", () => {
  it("covers every permission while preserving English labels and all authorization data", () => {
    const before = JSON.stringify(defaultRoleDefinitions());
    for (const permission of PERMISSIONS) {
      expect(permissionCopy(createTranslator("en"), permission)).toEqual(PERMISSION_LABELS[permission]);
      const ar = permissionCopy(createTranslator("ar"), permission);
      expect(ar.label).toMatch(/[ء-ي]/); expect(ar.hint).toMatch(/[ء-ي]/);
      expect(ar.label).not.toContain(permission);
    }
    expect(knownPermissionCopy(createTranslator("ar"), "unknown.permission")).toBeUndefined();
    expect(JSON.stringify(defaultRoleDefinitions())).toBe(before);
  });
});
