import { describe, expect, it } from "vitest";
import { signedInRedirectTarget } from "./signed-in-routing";

const at = (pathname: string, search?: string) => signedInRedirectTarget({ pathname, search });

describe("signed-in routing", () => {
  it("sends a signed-in visitor away from the landing on every host", () => {
    expect(at("/")).toBe("/login");
  });

  it("shows the landing to someone signed in only when they ask for it", () => {
    expect(at("/", "?view=landing")).toBeNull();
    expect(at("/", "?view=landing&utm_source=console")).toBeNull();
    expect(at("/", "?view=other")).toBe("/login");
    // Only the landing uses this exception. Portals keep their own role check.
    expect(at("/signup", "?view=landing")).toBe("/login");
    expect(at("/login/admin", "?view=landing")).toBeNull();
  });

  it("sends application and registration pages to the resolver", () => {
    for (const path of ["/signup", "/login/member/create"]) {
      expect(at(path)).toBe("/login");
    }
  });

  it("keeps explicit portals so signed-in accounts must pass their audience checks", () => {
    for (const path of ["/login/gym", "/login/member", "/login/admin"]) {
      expect(at(path, "?next=%2Fplatform")).toBeNull();
    }
  });

  it("leaves the resolver, the app and the documents alone", () => {
    for (const path of ["/login", "/login/accept-invitation", "/dashboard", "/customer/my-gyms", "/terms", "/privacy", "/customer/discover"]) {
      expect(at(path)).toBeNull();
    }
  });
});
