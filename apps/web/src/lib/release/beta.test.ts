import { describe, expect, it } from "vitest";
import { RIVET_IN_BETA, rivetSender } from "./beta";

describe("RIVET sender", () => {
  it("keeps the configured address and names it RIVET Beta during the beta", () => {
    expect(RIVET_IN_BETA).toBe(true);
    expect(rivetSender("noreply@rivetjo.com")).toBe("RIVET Beta <noreply@rivetjo.com>");
    expect(rivetSender("  RIVET <noreply@rivetjo.com> ")).toBe("RIVET Beta <noreply@rivetjo.com>");
    expect(rivetSender('"RIVET Team" <noreply@rivetjo.com>')).toBe("RIVET Beta <noreply@rivetjo.com>");
  });
});
