import { PERMISSION_LABELS, type Permission } from "../domain/permissions";
import type { RoleKey } from "../domain/types";
import { en } from "./messages/en";
import type { TFunction } from "./core";

/** Presentation only: permission codes, role definitions and limits stay authoritative. */
export function permissionCopy(t: TFunction, permission: Permission): { label: string; hint: string } {
  const key = permission.replaceAll(".", "_") as keyof typeof en.permissions;
  return { label: t(`permissions.${key}.label`), hint: t(`permissions.${key}.hint`) };
}
export function knownPermissionCopy(t: TFunction, permission: string) {
  return Object.hasOwn(PERMISSION_LABELS, permission) ? permissionCopy(t, permission as Permission) : undefined;
}
const ROLE_DESCRIPTION_KEYS = { owner: "setup.roleOwner", manager: "setup.roleManager", salesperson: "setup.roleSalesperson", receptionist: "setup.roleReceptionist", trainer: "setup.roleTrainer" } as const;
export function roleDescription(t: TFunction, role: RoleKey): string { return t(ROLE_DESCRIPTION_KEYS[role]); }
