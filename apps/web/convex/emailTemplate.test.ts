import { describe, expect, it } from "vitest";
import { attachmentSizeLabel, footerLines, renderBrandedEmail } from "./emailTemplate";

const base = {
  language: "en" as const,
  audience: "gym" as const,
  headline: "A RIVET invoice was issued",
  paragraphs: ["Invoice INV-2026-000184 covers 3 Sep – 2 Oct 2026."],
  siteUrl: "https://www.rivetjo.com",
};

describe("branded email", () => {
  it("builds the one-column template: lockup, headline, card, one button, footer", () => {
    const { html, text } = renderBrandedEmail("A RIVET invoice was issued", {
      ...base,
      rows: [{ label: "Invoice number", value: "INV-2026-000184", mono: true }, { label: "Amount", value: "JOD 129.133", strong: true }],
      button: { label: "View invoice", href: "https://www.rivetjo.com/settings?section=subscription" },
      attachment: { filename: "RIVET-invoice-INV-2026-000184.pdf", sizeLabel: "84 KB" },
    });
    expect(html).toContain('width="600"');
    expect(html).toContain("/brand/rivet-lockup.png");
    expect(html).toContain("/brand/rivet-lockup-rev.png");
    expect(html).toContain("#F5F4EF");
    expect(html).toContain("A RIVET invoice was issued");
    expect(html).toContain("INV-2026-000184");
    expect(html).toContain("IBM Plex Mono");
    // Exactly one action, and it is the ink button.
    expect([...html.matchAll(/class="rv-button"/g)]).toHaveLength(1);
    expect(html).toContain("#1B1A15");
    expect(text).toContain("Invoice number: INV-2026-000184");
    expect(text).toContain("View invoice: https://www.rivetjo.com/settings?section=subscription");
  });

  it("carries no red unless something needs attention, and then only one chip", () => {
    const quiet = renderBrandedEmail("s", base);
    expect(quiet.html).not.toContain("#AD1B22");
    const pastDue = renderBrandedEmail("s", { ...base, status: { label: "Past due", tone: "danger" } });
    expect([...pastDue.html.matchAll(/#AD1B22/g)]).toHaveLength(1);
    expect(pastDue.html).toContain("#FAE9E9");
  });

  it("leads with the gym and uses its accent for a member, and never offers email preferences to one", () => {
    const member = renderBrandedEmail("Your PT session is booked", {
      ...base,
      audience: "member",
      gymName: "Forge Fitness Club",
      accent: "#176E44",
      button: { label: "View the booking", href: "https://www.rivetjo.com/customer/my-gyms" },
    });
    expect(member.html).toContain("Forge Fitness Club");
    expect(member.html).toContain("#176E44");
    expect(member.html).not.toContain("Email preferences");
    expect(member.text).toContain("Sent by RIVET for Forge Fitness Club, which is responsible for your membership.");
    // The accent colours the button only; a gym-facing message stays ink.
    const gym = renderBrandedEmail("s", { ...base, accent: "#176E44", button: { label: "Open", href: "https://www.rivetjo.com" } });
    expect(gym.html).not.toContain("#176E44");
  });

  it("mirrors for Arabic without mirroring the logo", () => {
    const arabic = renderBrandedEmail("تم إصدار فاتورة RIVET", { ...base, language: "ar", headline: "تم إصدار فاتورة RIVET", paragraphs: ["الدفع مستحق."] });
    expect(arabic.html).toContain('dir="rtl"');
    expect(arabic.html).toContain("IBM Plex Sans Arabic");
    expect(arabic.html).toContain("/brand/rivet-lockup.png");
    expect(arabic.text).toContain("RIVET · عمّان، الأردن");
    expect(arabic.text).toContain("الدعم 09:00–21:00 بتوقيت عمّان، من السبت إلى الخميس");
  });

  it("renders dark mode from the same markup", () => {
    const { html } = renderBrandedEmail("s", base);
    expect(html).toContain("prefers-color-scheme:dark");
    expect(html).toContain("#15140F");
    expect(html).toContain(".rv-logo-dark{display:block!important}");
  });

  it("keeps the footer complete, and unsubscribes only from marketing", () => {
    // Six lines until RIVET's registered entity is filled in; the seventh appears then.
    expect(footerLines({ ...base })).toHaveLength(6);
    expect(footerLines({ ...base }).join("\n")).toContain("Privacy policy · Terms of service · Email preferences");
    expect(footerLines({ ...base, marketing: true }).join("\n")).toContain("Unsubscribe");
    expect(footerLines({ ...base }).join("\n")).not.toContain("Unsubscribe");
    expect(footerLines({ ...base })[1]).toContain("sales@rivetjo.com");
  });

  it("sizes an attachment the way a reader reads it", () => {
    expect(attachmentSizeLabel(4 * 1024 * 4 / 3)).toBe("4 KB");
    expect(attachmentSizeLabel(2 * 1024 * 1024 * 4 / 3)).toBe("2.0 MB");
  });
});
