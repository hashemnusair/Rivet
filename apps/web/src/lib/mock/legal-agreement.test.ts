import { beforeEach, describe, expect, it } from "vitest";
import { ERR } from "@/lib/api/errors";
import { MockGymOSApi } from "./MockGymOSApi";
import { canonicalAgreementText, sha256Hex } from "../../../convex/legalAgreementText";

let api: MockGymOSApi;
const PNG = `data:image/png;base64,${"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ".repeat(8)}`;

beforeEach(async () => {
  api = new MockGymOSApi();
  api.setBehavior({ latencyMs: 0 });
  await api.switchDemoRole("owner");
});

async function input(overrides: Record<string, unknown> = {}) {
  return {
    customer: { legalName: "Forge Fitness Club LLC", address: "Abdoun Circle, Amman" },
    signatory: { name: "Omar Al-Khatib", idType: "national" as const, idNumber: "9871234567", email: "omar@forgefitness.jo" },
    subscription: { plan: "Pro" as const, startDate: "2026-10-01" },
    consents: { agreement: true, authority: true, electronic: true, accurate: true },
    signature: { method: "drawn" as const, imageDataUrl: PNG },
    client: { userAgent: "test", language: "en", viewport: "390x844" },
    clientDocumentSha256: await sha256Hex(canonicalAgreementText()),
    idempotencyKey: "mock-sign-1",
    ...overrides,
  };
}

describe("mock subscription agreement parity", () => {
  it("seeds a countersigned agreement for the demo gym and can simulate an unsigned gym", async () => {
    const session = await api.getSession();
    expect(session.legal).toEqual({ agreementStatus: "countersigned", agreementReference: "RVT-20260815-FORGE" });
    const context = await api.getSubscriptionAgreementContext();
    expect(context).toMatchObject({ status: "countersigned", canSign: false, agreement: { reference: "RVT-20260815-FORGE", signatory: { idNumberMasked: "••••••4567" } } });
    expect(Object.keys(context.prefill).sort()).toEqual(["address", "email", "legalName", "plan", "signatoryName", "startDate"]);
    expect(context.sha256).toBe(await sha256Hex(context.text));
    api.setBehavior({ agreementUnsigned: true });
    expect((await api.getSession()).legal).toEqual({ agreementStatus: "required" });
    expect((await api.getSubscriptionAgreementContext()).canSign).toBe(true);
    await api.switchDemoRole("manager");
    expect((await api.getSession()).legal).toEqual({ agreementStatus: "not_applicable" });
  });

  it("signs once, masks the ID, replays by key, and lets the platform countersign and reveal with a reason", async () => {
    api.setBehavior({ agreementUnsigned: true });
    await expect(api.signSubscriptionAgreement(await input({ consents: { agreement: true, authority: false, electronic: true, accurate: true } }))).rejects.toMatchObject({ code: ERR.VALIDATION });
    await expect(api.signSubscriptionAgreement(await input({ signatory: { name: "Omar Al-Khatib", idType: "national", idNumber: "123", email: "omar@forgefitness.jo" } }))).rejects.toMatchObject({ code: ERR.VALIDATION });
    await expect(api.signSubscriptionAgreement(await input({ customer: { legalName: "Forge Fitness Club LLC", address: "" } }))).rejects.toMatchObject({ code: ERR.VALIDATION });
    const signed = await api.signSubscriptionAgreement(await input());
    expect(signed.reference).toMatch(/^RVT-\d{8}-[A-Z2-9]{5}$/);
    expect(signed).toMatchObject({ status: "signed", hashMatch: true, signatory: { idNumberMasked: "••••••4567" } });
    expect((signed.signatory as { idNumber?: string }).idNumber).toBeUndefined();
    expect((await api.signSubscriptionAgreement(await input())).id).toBe(signed.id);
    await expect(api.signSubscriptionAgreement(await input({ idempotencyKey: "mock-sign-2" }))).rejects.toMatchObject({ code: ERR.CONFLICT });
    expect((await api.getSession()).legal).toEqual({ agreementStatus: "signed", agreementReference: signed.reference });

    await api.switchDemoRole("manager");
    await expect(api.signSubscriptionAgreement(await input({ idempotencyKey: "mock-sign-3" }))).rejects.toMatchObject({ code: ERR.FORBIDDEN });

    await api.switchDemoRole("owner");
    const list = await api.listPlatformAgreements();
    expect(list.map((row) => row.id)).toContain(signed.id);
    await expect(api.revealPlatformAgreementId({ agreementId: signed.id, reason: " " })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const reveal = await api.revealPlatformAgreementId({ agreementId: signed.id, reason: "Contract verification" });
    expect(reveal).toEqual({ idNumber: "9871234567", idType: "national", revealCount: 1 });
    const actor = (await api.getSession()).user.name;
    await expect(api.countersignPlatformAgreement({ agreementId: signed.id, title: "Co-founder", typedName: "Nope", idempotencyKey: "cs" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const countersigned = await api.countersignPlatformAgreement({ agreementId: signed.id, title: "Co-founder", typedName: actor, idempotencyKey: "cs" });
    expect(countersigned).toMatchObject({ status: "countersigned", countersign: { byName: actor, title: "Co-founder" } });
    const resend = await api.resendPlatformAgreementCopies({ agreementId: signed.id, audience: "rivet", idempotencyKey: "resend-1" });
    expect(resend).toEqual({ sequence: 1, deliveries: [
      { recipient: "elias@rivetjo.com", status: "suppressed", reason: "Operational email mode is off (RIVET_EMAIL_MODE)" },
      { recipient: "hashem@rivetjo.com", status: "suppressed", reason: "Operational email mode is off (RIVET_EMAIL_MODE)" },
    ] });
    expect(await api.resendPlatformAgreementCopies({ agreementId: signed.id, audience: "rivet", idempotencyKey: "resend-1" })).toEqual(resend);
    const withSigner = await api.resendPlatformAgreementCopies({ agreementId: signed.id, audience: "all", idempotencyKey: "resend-2" });
    expect(withSigner.sequence).toBe(2);
    expect(withSigner.deliveries.map((delivery) => delivery.recipient)).toContain("omar@forgefitness.jo");

    const audits = (await api.listAuditEvents({ pageSize: 50 })).items.filter((event) => event.action === "legal.agreement.sign");
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]?.after)).not.toContain("9871234567");
  });
});
