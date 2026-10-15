import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WhatsAppHandoff } from "./whatsapp-handoff";
import { LocaleProvider } from "@/lib/i18n/provider";
import { hasCatalogue, loadCatalogue } from "@/lib/i18n/core";

// The browser bundle: Arabic is not there until something asks for it.
vi.mock("@/lib/i18n/arabic-catalogue", () => ({ bundledArabic: undefined }));
vi.mock("@/lib/hooks/use-api", () => ({ useApiMutation: () => ({ mutate: vi.fn(), isPending: false }), useInvalidate: () => vi.fn() }));
vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session: { organization: { name: "Forge", timezone: "Asia/Amman", phoneCountryCallingCode: "962", defaultLanguage: "en" } } }),
}));

describe("WhatsAppHandoff on an English screen for an Arabic-speaking member", () => {
  it("holds the button until Arabic arrives, then drafts in Arabic", async () => {
    expect(hasCatalogue("ar")).toBe(false);
    await act(async () => {
      render(<LocaleProvider initialLocale="en"><WhatsAppHandoff subject="member" subjectId="member-1" recipientName="Lina Haddad" recipientPreferredLanguage="ar" phone="079 555 0101" /></LocaleProvider>);
    });
    expect(screen.getByRole("button", { name: "WhatsApp" })).toBeDisabled();

    await act(async () => { await loadCatalogue("ar"); });
    await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect((screen.getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement).value).toContain("مرحبًا");
  });

  it("writes a caller's draft with the recipient's translator and language", async () => {
    await act(async () => {
      render(<LocaleProvider initialLocale="en"><WhatsAppHandoff subject="member" subjectId="member-1" recipientName="Lina Haddad" recipientPreferredLanguage="ar" phone="079 555 0101" initialMessage={(t, language) => `${language}: ${t("common.action.save")}`} /></LocaleProvider>);
    });
    await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect((screen.getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement).value).toBe("ar: حفظ التغييرات");
  });
});
