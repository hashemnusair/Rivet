import { describe, expect, it } from "vitest";
import { parseEmailAllowlist, recipientAllowed, resolveEmailMode, routeEmail, sandboxSubject } from "./emailMode";

describe("operational email go-live flag", () => {
  it("defaults to off, honours the four modes, and falls back to off with a warning on garbage", () => {
    expect(resolveEmailMode({})).toEqual({ mode: "off", source: "default" });
    expect(resolveEmailMode({ RIVET_EMAIL_MODE: "sandbox" })).toEqual({ mode: "sandbox", source: "RIVET_EMAIL_MODE" });
    expect(resolveEmailMode({ RIVET_EMAIL_MODE: " LIVE " })).toEqual({ mode: "live", source: "RIVET_EMAIL_MODE" });
    expect(resolveEmailMode({ RIVET_EMAIL_MODE: "on" })).toMatchObject({ mode: "off", source: "default", warning: expect.stringMatching(/not one of/) });
  });

  it("treats the legacy live boolean as live only when the new variable is unset", () => {
    expect(resolveEmailMode({ RIVET_OPERATIONAL_EMAIL_LIVE: "true" })).toEqual({ mode: "live", source: "legacy_live_flag" });
    expect(resolveEmailMode({ RIVET_OPERATIONAL_EMAIL_LIVE: "true", RIVET_EMAIL_MODE: "off" })).toEqual({ mode: "off", source: "RIVET_EMAIL_MODE" });
    expect(resolveEmailMode({ RIVET_OPERATIONAL_EMAIL_LIVE: "false" })).toEqual({ mode: "off", source: "default" });
  });

  it("matches allowlist entries by address or domain", () => {
    const list = parseEmailAllowlist(" Omar@RivetJo.com, @pilotgym.jo ,rivet.example ");
    expect(list).toEqual(["omar@rivetjo.com", "@pilotgym.jo", "rivet.example"]);
    expect(recipientAllowed("omar@rivetjo.com", list)).toBe(true);
    expect(recipientAllowed("anyone@pilotgym.jo", list)).toBe(true);
    expect(recipientAllowed("someone@rivet.example", list)).toBe(true);
    expect(recipientAllowed("member@gmail.com", list)).toBe(false);
  });

  it("routes a message according to the mode and never sends to a real inbox from sandbox", () => {
    expect(routeEmail({ mode: "off", kind: "payment_receipt", recipient: "a@b.jo" })).toEqual({ decision: "drop", reason: "Email mode is off" });
    expect(routeEmail({ mode: "sandbox", kind: "payment_receipt", recipient: "a@b.jo", sandboxTo: "inbox@rivetjo.com" })).toEqual({ decision: "redirect", to: "inbox@rivetjo.com", originalRecipient: "a@b.jo" });
    expect(routeEmail({ mode: "sandbox", kind: "payment_receipt", recipient: "a@b.jo" })).toMatchObject({ decision: "drop", reason: expect.stringMatching(/SANDBOX_TO/) });
    expect(routeEmail({ mode: "allowlist", kind: "payment_receipt", recipient: "a@b.jo", allowlist: ["@b.jo"] })).toEqual({ decision: "send", to: "a@b.jo" });
    expect(routeEmail({ mode: "allowlist", kind: "payment_receipt", recipient: "a@c.jo", allowlist: ["@b.jo"] })).toMatchObject({ decision: "drop" });
    expect(routeEmail({ mode: "live", kind: "payment_receipt", recipient: "A@B.jo" })).toEqual({ decision: "send", to: "a@b.jo" });
    expect(sandboxSubject("Your receipt", "a@b.jo")).toBe("[sandbox → a@b.jo] Your receipt");
  });
});

describe("allowlist trust", () => {
  it("sends to a subscribed gym's team member without a list entry, and only then", () => {
    expect(routeEmail({ mode: "allowlist", kind: "platform_invoice_issued", recipient: "owner@gmail.com", allowlist: ["@rivetjo.com"], trusted: true })).toEqual({ decision: "send", to: "owner@gmail.com" });
    expect(routeEmail({ mode: "allowlist", kind: "platform_invoice_issued", recipient: "owner@gmail.com", allowlist: ["@rivetjo.com"], trusted: false })).toMatchObject({ decision: "drop", reason: expect.stringMatching(/subscribed gym/) });
    expect(routeEmail({ mode: "live", kind: "platform_invoice_issued", recipient: "owner@gmail.com", trusted: false })).toEqual({ decision: "send", to: "owner@gmail.com" });
  });
});
