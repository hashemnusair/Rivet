import { describe, expect, it } from "vitest";
import { getAppQueryDefaults } from "./query-policy";

describe("application query policy", () => {
  it("does not run a global background refresh loop in Convex mode", () => {
    expect(getAppQueryDefaults(true)).toMatchObject({
      staleTime: 10_000,
      refetchInterval: false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    });
  });

  it("keeps the mock refresh policy independent from Convex", () => {
    expect(getAppQueryDefaults(false)).toMatchObject({
      staleTime: 5_000,
      refetchInterval: false,
    });
  });
});
