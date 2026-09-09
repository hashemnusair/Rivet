import { describe, expect, it } from "vitest";
import type { RivetIdentity } from "@/lib/auth/rivet-identity";
import { destinationForDemo, destinationForIdentity } from "./public-viewer";

const ready = (overrides: Partial<RivetIdentity>): RivetIdentity => ({
  status: "ready",
  platformAdmin: false,
  gymAccessUnavailable: false,
  organizationSelectionRequired: false,
  memberships: [],
  ...overrides,
} as RivetIdentity);

const membership = (role: string) => ({ organizationId: "org-1", organizationName: "Forge", role, branchScope: "all", branches: [] }) as unknown as RivetIdentity["memberships"][number];

describe("public viewer destinations", () => {
  it("names each area the way the site does", () => {
    expect(destinationForIdentity(ready({ platformAdmin: true }))).toMatchObject({ href: "/platform", label: "Platform", verb: "Open the platform" });
    expect(destinationForIdentity(ready({ memberships: [membership("owner")] }))).toMatchObject({ href: "/dashboard", label: "Dashboard", verb: "Open your dashboard" });
    expect(destinationForIdentity(ready({ memberships: [membership("receptionist")] }))).toMatchObject({ href: "/reception", label: "Reception" });
    expect(destinationForIdentity(ready({}))).toMatchObject({ href: "/customer/my-gyms", label: "My gyms", verb: "Open your gyms" });
  });

  it("points at the resolver while the role is unknown or needs a choice", () => {
    expect(destinationForIdentity({ status: "loading", platformAdmin: false, gymAccessUnavailable: false, memberships: [] })).toMatchObject({ href: "/login", area: "resolving" });
    expect(destinationForIdentity(ready({ memberships: [membership("owner"), { ...membership("manager"), organizationId: "org-2" }] }))).toMatchObject({ href: "/login?reason=organization-selection", area: "resolving" });
    expect(destinationForIdentity(ready({ gymAccessUnavailable: true }))).toMatchObject({ href: "/login", area: "resolving" });
  });

  it("reads the demo personas in the same order the product resolves them", () => {
    expect(destinationForDemo({ platformAdmin: true, gymRole: "owner", member: true })?.href).toBe("/platform");
    expect(destinationForDemo({ platformAdmin: false, gymRole: "receptionist", member: false })?.href).toBe("/reception");
    expect(destinationForDemo({ platformAdmin: false, member: true })?.href).toBe("/customer/my-gyms");
    expect(destinationForDemo({ platformAdmin: false, member: false })).toBeNull();
  });
});
