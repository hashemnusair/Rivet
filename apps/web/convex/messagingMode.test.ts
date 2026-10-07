import { describe, expect, it } from "vitest";
import { RETIRED_CHANNEL_REASON, resolveMessagingMode, routeMessage, toE164 } from "./messagingMode";

describe("retired automated messaging", () => {
  it.each(["off", "sandbox", "allowlist", "live"] as const)("cannot reactivate with legacy %s settings", (mode) => {
    expect(resolveMessagingMode({ RIVET_MESSAGING_MODE: mode, RIVET_MESSAGING_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "test", TWILIO_AUTH_TOKEN: "fixture", TWILIO_WHATSAPP_FROM: "whatsapp:+962790000000" })).toMatchObject({ mode: "off", provider: "none", whatsappReady: false });
    for (const channel of ["whatsapp", "sms"] as const) {
      expect(routeMessage({ mode, channel, recipient: "+962790000000", resolution: { whatsappReady: true } })).toEqual({ decision: "drop", reason: RETIRED_CHANNEL_REASON });
    }
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

});
