import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/lib/i18n/provider";
import { RIVET_CONTACT } from "@/lib/rivet-contact";
import { BetaBadge, BetaNote, BetaNotice } from "./beta-badge";

describe("beta marks", () => {
  it("say RIVET is in beta in English and link problems to WhatsApp", () => {
    render(
      <LocaleProvider initialLocale="en">
        <BetaBadge />
        <BetaNotice />
        <BetaNote />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("beta-badge")).toHaveTextContent("Beta");
    expect(screen.getByTestId("beta-notice")).toHaveTextContent("RIVET is in beta. Some features may still change or not work as expected.");
    expect(screen.getByRole("link", { name: "Report a problem on WhatsApp" })).toHaveAttribute("href", RIVET_CONTACT.whatsappHref);
  });

  it("say the same in Arabic and keep RIVET in Latin script", () => {
    render(
      <LocaleProvider initialLocale="ar">
        <BetaBadge />
        <BetaNotice />
        <BetaNote />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("beta-badge")).toHaveTextContent("تجريبي");
    expect(screen.getByTestId("beta-notice")).toHaveTextContent("منصة RIVET في مرحلة الإطلاق التجريبي.");
    expect(screen.getByRole("link", { name: "الإبلاغ عن مشكلة عبر واتساب" })).toHaveAttribute("href", RIVET_CONTACT.whatsappHref);
  });
});
