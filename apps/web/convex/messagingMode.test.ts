import { describe, expect, it } from "vitest";
import { parseMessagingAllowlist, phoneAllowed, resolveMessagingMode, routeMessage, toE164, twilioMessageParams } from "./messagingMode";
import { MESSAGE_TEMPLATE_CATALOGUE, renderMessageTemplate } from "./messagingTemplates";

const twilio = { RIVET_MESSAGING_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "secret", TWILIO_MESSAGING_SERVICE_SID: "MG123", TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886" };

describe("messaging go-live flag", () => {
  it("defaults to off with no provider and reports readiness per channel", () => {
    expect(resolveMessagingMode({})).toMatchObject({ mode: "off", provider: "none", whatsappReady: false, smsReady: false });
    expect(resolveMessagingMode({ RIVET_MESSAGING_MODE: "live", ...twilio })).toMatchObject({ mode: "live", provider: "twilio", whatsappReady: true, smsReady: true });
    expect(resolveMessagingMode({ RIVET_MESSAGING_MODE: "live", ...twilio, TWILIO_WHATSAPP_FROM: "" })).toMatchObject({ whatsappReady: false, smsReady: true });
    expect(resolveMessagingMode({ RIVET_MESSAGING_MODE: "yes" })).toMatchObject({ mode: "off", warning: expect.stringMatching(/not one of/) });
  });

  it("normalises Jordanian numbers to E.164 and rejects nonsense", () => {
    expect(toE164("077 837 8608")).toBe("+962778378608");
    expect(toE164("0778378608")).toBe("+962778378608");
    expect(toE164("+962 79 555 0101")).toBe("+962795550101");
    expect(toE164("00962795550101")).toBe("+962795550101");
    expect(toE164("962795550101")).toBe("+962795550101");
    expect(toE164("abc")).toBeUndefined();
    expect(toE164("")).toBeUndefined();
  });

  it("matches allowlist numbers exactly or by prefix", () => {
    const list = parseMessagingAllowlist("077 837 8608, +96279*");
    expect(list).toEqual(["+962778378608", "+96279*"]);
    expect(phoneAllowed("0778378608", list)).toBe(true);
    expect(phoneAllowed("0795550101", list)).toBe(true);
    expect(phoneAllowed("0785550101", list)).toBe(false);
  });

  it("routes by mode and never lets sandbox reach a member", () => {
    const resolution = resolveMessagingMode({ RIVET_MESSAGING_MODE: "sandbox", ...twilio });
    expect(routeMessage({ mode: "off", channel: "whatsapp", recipient: "0795550101", resolution })).toMatchObject({ decision: "drop", reason: expect.stringMatching(/mode is off/) });
    expect(routeMessage({ mode: "sandbox", channel: "whatsapp", recipient: "0795550101", sandboxTo: "0778378608", resolution })).toEqual({ decision: "redirect", to: "+962778378608", originalRecipient: "+962795550101" });
    expect(routeMessage({ mode: "sandbox", channel: "sms", recipient: "0795550101", resolution })).toMatchObject({ decision: "drop", reason: expect.stringMatching(/SANDBOX_TO/) });
    expect(routeMessage({ mode: "allowlist", channel: "sms", recipient: "0795550101", allowlist: ["+96279*"], resolution })).toEqual({ decision: "send", to: "+962795550101" });
    expect(routeMessage({ mode: "allowlist", channel: "sms", recipient: "0785550101", allowlist: ["+96279*"], resolution })).toMatchObject({ decision: "drop" });
    expect(routeMessage({ mode: "live", channel: "whatsapp", recipient: "0795550101", resolution: { whatsappReady: false, smsReady: true } })).toMatchObject({ decision: "drop", reason: expect.stringMatching(/WhatsApp sender/) });
    expect(routeMessage({ mode: "live", channel: "sms", recipient: "not a phone", resolution })).toMatchObject({ decision: "drop", reason: expect.stringMatching(/missing or not a valid/) });
  });

  it("builds Twilio parameters per channel", () => {
    const whatsapp = twilioMessageParams({ channel: "whatsapp", to: "+962795550101", body: "Hi", env: twilio });
    expect(whatsapp.get("To")).toBe("whatsapp:+962795550101");
    expect(whatsapp.get("From")).toBe("whatsapp:+14155238886");
    const sms = twilioMessageParams({ channel: "sms", to: "+962795550101", body: "Hi", env: twilio });
    expect(sms.get("MessagingServiceSid")).toBe("MG123");
    expect(sms.get("From")).toBeNull();
  });

  it("ships a bilingual utility catalogue whose variables all render", () => {
    expect(MESSAGE_TEMPLATE_CATALOGUE.length).toBeGreaterThanOrEqual(9);
    for (const template of MESSAGE_TEMPLATE_CATALOGUE) {
      expect(template.category).toBe("utility");
      const variables = Object.fromEntries(template.variables.map((key) => [key, `<${key}>`]));
      for (const body of [template.bodyEn, template.bodyAr]) {
        const rendered = renderMessageTemplate(body, variables);
        expect(rendered).not.toMatch(/\{\{/);
        expect(rendered).toContain("<gym_name>");
      }
    }
    expect(renderMessageTemplate("Hi {{member_name}}, {{unknown}}", { member_name: "Lina" })).toBe("Hi Lina, {{unknown}}");
  });
});
