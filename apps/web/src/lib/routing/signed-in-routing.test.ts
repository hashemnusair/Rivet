import { describe, expect, it } from "vitest";
import { signedInRedirectTarget } from "./signed-in-routing";

const at = (pathname: string) => signedInRedirectTarget({ pathname });

describe("signed-in routing", () => {
  it("sends a signed-in visitor away from the landing on every host", () => {
    expect(at("/")).toBe("/login");
  });

  it("sends the application and every sign-in door to the resolver", () => {
    for (const path of ["/signup", "/login/gym", "/login/member", "/login/admin", "/login/member/create"]) {
      expect(at(path)).toBe("/login");
    }
  });

  it("leaves the resolver, the app and the documents alone", () => {
    for (const path of ["/login", "/login/accept-invitation", "/dashboard", "/customer/my-gyms", "/terms", "/privacy", "/customer/discover"]) {
      expect(at(path)).toBeNull();
    }
  });
});
