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

  it("is light in every client and never carries a dark palette", () => {
    const { html } = renderBrandedEmail("s", base);
    expect(html).not.toContain("prefers-color-scheme");
    expect(html).not.toContain("#15140F");
    expect(html).not.toContain("rivet-lockup-rev");
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain("color-scheme:light only");
    // Outlook's recolouring is overridden back to paper, white and ink.
    expect(html).toContain("[data-ogsc] .rv-frame");
    expect(html).toContain(`[data-ogsc] .rv-button-link,[data-ogsb] .rv-button-link{color:${"#F5F4EF"}!important}`);
  });

  it("holds its colour in Gmail, which offers no way to refuse dark mode", () => {
    const { html } = renderBrandedEmail("s", {
      ...base,
      siteUrl: "https://www.rivetjo.com",
      rows: [{ label: "Amount", value: "JOD 129.133", strong: true }],
      button: { label: "View invoice", href: "https://www.rivetjo.com" },
      attachment: { filename: "invoice.pdf", sizeLabel: "84 KB" },
    });
    // Gmail leaves an element alone when it carries a background image, so
    // every surface is painted with a pixel of its own colour.
    for (const [colour, pixel] of [["#EDECE5", "sunken"], ["#FFFFFF", "surface"], ["#F5F4EF", "paper"], ["#1B1A15", "ink"]] as const) {
      expect(html).toContain(`background-color:${colour};background-image:url(https://www.rivetjo.com/brand/email-${pixel}.png)`);
    }
    // The page, the frame, the header, the card, the chip, the button and the
    // footer each state their colour three ways, so a reader with images off
    // still sees the same message.
    expect(html.match(/bgcolor="/g)?.length ?? 0).toBeGreaterThanOrEqual(7);
    expect(html).toContain('<body class="rv-body" bgcolor="#EDECE5"');
    expect(html).not.toContain("background:#FFFFFF;border:1px solid");
  });

  it("paints the writing as well as the panel, so the ink cannot be lightened alone", () => {
    const { html } = renderBrandedEmail("s", {
      ...base,
      siteUrl: "https://www.rivetjo.com",
      rows: [{ label: "Amount", value: "JOD 129.133", strong: true }],
      button: { label: "View invoice", href: "https://www.rivetjo.com" },
      attachment: { filename: "invoice.pdf", sizeLabel: "84 KB" },
      note: "If something looks wrong, contact support.",
    });
    const painted = (fragment: string) => {
      const index = html.indexOf(fragment);
      expect(index, `${fragment} is in the message`).toBeGreaterThan(-1);
      const element = html.slice(index, html.indexOf(">", index));
      expect(element, `${fragment} carries its own paint`).toContain("background-image:url(https://www.rivetjo.com/brand/email-");
    };
    // Each of these is a colour Gmail would otherwise lighten on a panel it
    // has been made to leave alone, which is what puts pale text on white.
    painted('class="rv-headline"');
    painted('class="rv-secondary"');
    painted('class="rv-muted rv-label"');
    painted('class="rv-ink rv-value"');
    painted('class="rv-button-link"');
    painted('class="rv-filename"');
  });

  it("reads on a phone: tighter gutters, stacked rows, a full-width button", () => {
    const { html } = renderBrandedEmail("s", { ...base, rows: [{ label: "Amount", value: "JOD 129.133", strong: true }], button: { label: "View invoice", href: "https://www.rivetjo.com" } });
    expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
    expect(html).toContain("@media only screen and (max-width:480px)");
    expect(html).toContain(".rv-card td{display:block!important;width:100%!important");
    expect(html).toContain(".rv-button,.rv-button a{display:block!important;width:100%!important");
    expect(html).toContain('class="rv-muted rv-label"');
    expect(html).toContain('class="rv-ink rv-value"');
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
