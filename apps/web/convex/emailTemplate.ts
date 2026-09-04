/**
 * The RIVET transactional email template.
 *
 * One column at 600px, a small lockup on paper, one headline, one action and
 * a complete footer, in the manner of an account receipt rather than a
 * marketing send. The markup is table-based with inline styles because mail
 * clients are not browsers; the stylesheet carries only the phone rules and
 * the overrides that hold a client's dark mode off.
 *
 * No Convex imports: the mock adapter and the tests render the same bytes.
 */
import { BRAND, BRAND_CONTACT, BRAND_YEAR, brandLegalLine } from "./brandTokens";

export type EmailLanguage = "en" | "ar";
/** Who is reading: a gym's own team, or one of its members. */
export type EmailAudience = "gym" | "member";
export type EmailStatusTone = "success" | "warning" | "danger";

export interface EmailRow {
  label: string;
  value: string;
  /** Identifiers and fingerprints are set in the mono face. */
  mono?: boolean;
  /** Amounts and other figures a reader compares. */
  strong?: boolean;
}

export interface BrandedEmail {
  language: EmailLanguage;
  audience: EmailAudience;
  headline: string;
  paragraphs: string[];
  /** Shown under the lockup on member-facing mail; the gym owns the relationship. */
  gymName?: string;
  rows?: EmailRow[];
  button?: { label: string; href: string };
  attachment?: { filename: string; sizeLabel: string };
  /** One short closing sentence; plain text, no second button. */
  note?: string;
  /** The one place a message may carry signal red. */
  status?: { label: string; tone: EmailStatusTone };
  /** The gym's accent, used only for a member-facing primary button. */
  accent?: string;
  siteUrl?: string;
  /** Marketing mail carries an unsubscribe line; service mail must not. */
  marketing?: boolean;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const MONO = "'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace";
const SANS = "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const SANS_AR = "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif";

/**
 * Gmail gives a sender no way to refuse its dark mode, and on Android it
 * recolours a light message wholesale. It does leave alone any element that
 * carries a background image, so every surface here is painted three ways: the
 * `bgcolor` attribute, the inline `background-color`, and a one-pixel image of
 * that exact colour. A client that blocks images still sees the colour.
 */
function surface(origin: string, colour: keyof typeof SURFACE_PIXELS): string {
  return `background-color:${BRAND[colour]};background-image:url(${origin}/brand/email-${SURFACE_PIXELS[colour]}.png);background-repeat:repeat;background-size:1px 1px`;
}

const SURFACE_PIXELS = { paper: "paper", surface: "surface", sunken: "sunken", ink: "ink" } as const;

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function siteOrigin(siteUrl: string | undefined): string {
  return (siteUrl ?? `https://${BRAND_CONTACT.website}`).replace(/\/$/, "");
}

const STATUS_COLOURS: Record<EmailStatusTone, { ink: string; background: string }> = {
  success: { ink: BRAND.successInk, background: BRAND.successBg },
  warning: { ink: BRAND.warningInk, background: BRAND.warningBg },
  danger: { ink: BRAND.signalDeep, background: BRAND.signalSoft },
};

/** The footer lines, in order, exactly as the identity system sets them. */
export function footerLines(message: BrandedEmail): string[] {
  const arabic = message.language === "ar";
  const lines = [
    `RIVET · ${arabic ? BRAND_CONTACT.cityAr : BRAND_CONTACT.city}`,
    `${BRAND_CONTACT.phone} · ${BRAND_CONTACT.whatsapp} · ${BRAND_CONTACT.instagram} · ${BRAND_CONTACT.website} · ${BRAND_CONTACT.email}`,
    arabic ? BRAND_CONTACT.supportHoursAr : BRAND_CONTACT.supportHours,
  ];
  const legal = arabic ? ["سياسة الخصوصية", "شروط الخدمة"] : ["Privacy policy", "Terms of service"];
  if (message.audience === "gym") legal.push(arabic ? "تفضيلات البريد" : "Email preferences");
  if (message.marketing) legal.push(arabic ? "إلغاء الاشتراك" : "Unsubscribe");
  lines.push(legal.join(" · "));
  lines.push(
    message.audience === "member" && message.gymName
      ? arabic
        ? `أُرسلت من RIVET نيابةً عن ${message.gymName}، المسؤول عن عضويتك.`
        : `Sent by RIVET for ${message.gymName}, which is responsible for your membership.`
      : arabic
        ? "هذه رسالة خدمة بخصوص حسابك في RIVET."
        : "This is a service message about your RIVET account.",
  );
  lines.push(arabic ? `© ${BRAND_YEAR} RIVET. جميع الحقوق محفوظة.` : `© ${BRAND_YEAR} RIVET. All rights reserved.`);
  const registered = brandLegalLine();
  if (registered) lines.push(registered);
  return lines;
}

function footerHtml(message: BrandedEmail, origin: string): string {
  const arabic = message.language === "ar";
  const font = arabic ? SANS_AR : SANS;
  const [contact, channels, hours, , why, copyright, legal] = footerLines(message);
  const link = (label: string, path: string) => `<a href="${origin}${path}" style="color:${BRAND.inkMuted};text-decoration:underline">${escapeHtml(label)}</a>`;
  const links = [link(arabic ? "سياسة الخصوصية" : "Privacy policy", "/privacy"), link(arabic ? "شروط الخدمة" : "Terms of service", "/terms")];
  if (message.audience === "gym") links.push(link(arabic ? "تفضيلات البريد" : "Email preferences", "/settings?section=email"));
  return `<tr><td class="rv-footer" bgcolor="${BRAND.sunken}" style="${surface(origin, "sunken")};border-top:1px solid ${BRAND.line};padding:24px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td valign="top" width="32" style="padding-${arabic ? "left" : "right"}:12px"><img src="${origin}/brand/rivet-glyph.png" width="14" alt="" style="height:20px;width:auto;display:block;border:0"></td>
<td valign="top" class="rv-muted" style="font-family:${font};font-size:12px;line-height:1.6;color:${BRAND.inkMuted}">
<div>${escapeHtml(contact!)}</div>
<div>${escapeHtml(channels!)}</div>
<div>${escapeHtml(hours!)}</div>
<div style="padding-top:8px">${links.join(" · ")}</div>
<div style="padding-top:8px">${escapeHtml(why!)}</div>
<div style="padding-top:8px">${escapeHtml(copyright!)}</div>
${legal ? `<div style="color:${BRAND.inkMuted}">${escapeHtml(legal)}</div>` : ""}
</td></tr></table></td></tr>`;
}

function rowsHtml(rows: EmailRow[], arabic: boolean, origin: string): string {
  const font = arabic ? SANS_AR : SANS;
  const start = arabic ? "right" : "left";
  const end = arabic ? "left" : "right";
  const cells = rows.map((row, index) => {
    const border = index === rows.length - 1 ? "" : `border-bottom:1px solid ${BRAND.line};`;
    const valueStyle = row.mono
      ? `font-family:${MONO};font-size:13px;`
      : `font-family:${font};font-size:15px;${row.strong ? "font-weight:600;" : ""}`;
    return `<tr>
<td class="rv-muted rv-label" align="${start}" style="${border}padding:12px 16px;font-family:${font};font-size:13px;color:${BRAND.inkMuted};">${escapeHtml(row.label)}</td>
<td class="rv-ink rv-value" align="${end}" style="${border}padding:12px 16px;${valueStyle}color:${BRAND.ink};word-break:break-word">${escapeHtml(row.value)}</td>
</tr>`;
  });
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="rv-card" bgcolor="${BRAND.surface}" style="border:1px solid ${BRAND.line};border-radius:8px;${surface(origin, "surface")}">${cells.join("")}</table>`;
}

function buttonHtml(button: { label: string; href: string }, accent: string | undefined, arabic: boolean, origin: string): string {
  const background = accent ?? BRAND.ink;
  const colour = accent ? "#FFFFFF" : BRAND.paper;
  const paint = accent
    ? `background-color:${background}`
    : surface(origin, "ink");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="rv-button" align="center" bgcolor="${background}" style="border-radius:6px;${paint}">
<a href="${escapeHtml(button.href)}" class="rv-button-link" style="display:inline-block;height:44px;line-height:44px;padding:0 24px;font-family:${arabic ? SANS_AR : SANS};font-size:15px;font-weight:600;color:${colour};text-decoration:none;border-radius:6px">${escapeHtml(button.label)}</a>
</td></tr></table>`;
}

function attachmentHtml(attachment: { filename: string; sizeLabel: string }, arabic: boolean, origin: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="rv-chip" bgcolor="${BRAND.paper}" style="${surface(origin, "paper")};border-radius:4px;padding:8px 12px;font-family:${MONO};font-size:13px;color:${BRAND.ink}">
<span style="display:inline-block;width:11px;height:14px;border:1.5px solid ${BRAND.ink};border-radius:2px;vertical-align:-2px;margin-${arabic ? "left" : "right"}:10px"></span><span class="rv-filename">${escapeHtml(attachment.filename)}</span>
<span class="rv-muted" style="font-family:${arabic ? SANS_AR : SANS};font-size:12px;color:${BRAND.inkMuted};padding-${arabic ? "right" : "left"}:8px;white-space:nowrap">${escapeHtml(attachment.sizeLabel)}</span>
</td></tr></table>`;
}

function statusHtml(status: { label: string; tone: EmailStatusTone }, arabic: boolean): string {
  const colours = STATUS_COLOURS[status.tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${colours.background};border-radius:4px;padding:4px 8px;font-family:${arabic ? SANS_AR : SANS};font-size:12px;font-weight:600;color:${colours.ink}">${escapeHtml(status.label)}</td></tr></table>`;
}

/**
 * The message is light in every client. Dark-mode inversion is refused
 * where a client offers a way to refuse it: the colour-scheme declarations
 * for Apple Mail and iOS, and the data-ogsc/data-ogsb overrides Outlook
 * applies when it recolours a message. Gmail offers no such switch, so every
 * surface additionally carries a one-pixel background image of its own
 * colour, which Gmail's inverter leaves alone (see `surface`). Every colour
 * is also set inline and as a `bgcolor`, so a client that ignores the
 * stylesheet, or a reader with images off, still sees paper, white and ink.
 *
 * The phone rules keep one column with tighter gutters, stack each summary
 * row so long values read top to bottom, and make the button full width.
 */
const STYLE_CSS = `
:root{color-scheme:light only;supported-color-schemes:light}
body{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
[data-ogsc] .rv-body,[data-ogsb] .rv-body{background:${BRAND.sunken}!important}
[data-ogsc] .rv-frame,[data-ogsb] .rv-frame{background:${BRAND.surface}!important;border-color:${BRAND.lineStrong}!important}
[data-ogsc] .rv-header,[data-ogsb] .rv-header{background:${BRAND.paper}!important}
[data-ogsc] .rv-footer,[data-ogsb] .rv-footer{background:${BRAND.sunken}!important}
[data-ogsc] .rv-card,[data-ogsb] .rv-card{background:${BRAND.surface}!important;border-color:${BRAND.line}!important}
[data-ogsc] .rv-chip,[data-ogsb] .rv-chip{background:${BRAND.paper}!important;color:${BRAND.ink}!important}
[data-ogsc] .rv-ink,[data-ogsc] .rv-headline,[data-ogsb] .rv-ink,[data-ogsb] .rv-headline{color:${BRAND.ink}!important}
[data-ogsc] .rv-secondary,[data-ogsb] .rv-secondary{color:${BRAND.inkSecondary}!important}
[data-ogsc] .rv-muted,[data-ogsc] .rv-muted a,[data-ogsb] .rv-muted,[data-ogsb] .rv-muted a{color:${BRAND.inkMuted}!important}
[data-ogsc] .rv-button,[data-ogsb] .rv-button{background:${BRAND.ink}!important}
[data-ogsc] .rv-button-link,[data-ogsb] .rv-button-link{color:${BRAND.paper}!important}
@media only screen and (max-width:480px){
.rv-outer{padding:8px 0!important}
.rv-frame{border-left:0!important;border-right:0!important}
.rv-pad{padding-left:20px!important;padding-right:20px!important}
.rv-header{padding:24px 20px!important}
.rv-footer{padding:20px!important}
.rv-headline{font-size:20px!important}
.rv-card td{display:block!important;width:100%!important;box-sizing:border-box!important;text-align:start!important;padding:10px 14px!important}
.rv-card td.rv-label{padding-bottom:2px!important;border-bottom:0!important;font-size:12px!important}
.rv-card td.rv-value{padding-top:0!important}
.rv-button,.rv-button a{display:block!important;width:100%!important;text-align:center!important;box-sizing:border-box!important}
.rv-chip{display:block!important}
.rv-chip .rv-filename{word-break:break-all!important}
}`;

/** Subject plus both bodies for one message. */
export function renderBrandedEmail(subject: string, message: BrandedEmail): RenderedEmail {
  const arabic = message.language === "ar";
  const font = arabic ? SANS_AR : SANS;
  const origin = siteOrigin(message.siteUrl);
  const direction = arabic ? "rtl" : "ltr";
  const start = arabic ? "right" : "left";
  const blocks: string[] = [];

  blocks.push(`<div class="rv-headline" style="font-family:${font};font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;color:${BRAND.ink}">${escapeHtml(message.headline)}</div>`);
  if (message.status) blocks.push(statusHtml(message.status, arabic));
  for (const paragraph of message.paragraphs) {
    blocks.push(`<div class="rv-secondary" style="font-family:${font};font-size:15px;line-height:${arabic ? 1.7 : 1.55};color:${BRAND.inkSecondary}">${escapeHtml(paragraph)}</div>`);
  }
  if (message.rows?.length) blocks.push(rowsHtml(message.rows, arabic, origin));
  if (message.button) blocks.push(buttonHtml(message.button, message.audience === "member" ? message.accent : undefined, arabic, origin));
  if (message.attachment) blocks.push(attachmentHtml(message.attachment, arabic, origin));
  if (message.note) blocks.push(`<div class="rv-secondary" style="font-family:${font};font-size:14px;line-height:1.55;color:${BRAND.inkSecondary}">${escapeHtml(message.note)}</div>`);

  const body = blocks.map((block) => `<tr><td style="padding-bottom:20px">${block}</td></tr>`).join("");

  const html = `<!doctype html>
<html dir="${direction}" lang="${message.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subject)}</title><style>${STYLE_CSS}</style></head>
<body class="rv-body" bgcolor="${BRAND.sunken}" style="margin:0;padding:0;${surface(origin, "sunken")};color:${BRAND.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(message.paragraphs[0] ?? subject)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="rv-body" bgcolor="${BRAND.sunken}" style="${surface(origin, "sunken")}"><tr><td align="center" class="rv-outer" bgcolor="${BRAND.sunken}" style="${surface(origin, "sunken")};padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="rv-frame" bgcolor="${BRAND.surface}" style="width:600px;max-width:100%;${surface(origin, "surface")};border:1px solid ${BRAND.lineStrong}" dir="${direction}">
<tr><td class="rv-header rv-pad" align="${start}" bgcolor="${BRAND.paper}" style="${surface(origin, "paper")};border-bottom:1px solid ${BRAND.line};padding:32px">
<img src="${origin}/brand/rivet-lockup.png" width="112" alt="RIVET" style="width:112px;height:auto;display:block;border:0">
${message.gymName ? `<div class="rv-muted" style="font-family:${font};font-size:13px;color:${BRAND.inkMuted};padding-top:12px">${escapeHtml(message.gymName)}</div>` : ""}
</td></tr>
<tr><td class="rv-pad" align="${start}" bgcolor="${BRAND.surface}" style="${surface(origin, "surface")};padding:32px 32px 12px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${body}</table></td></tr>
${footerHtml(message, origin)}
</table></td></tr></table></body></html>`;

  const textLines = [message.headline, ""];
  if (message.status) textLines.push(message.status.label, "");
  textLines.push(...message.paragraphs, "");
  if (message.rows?.length) {
    for (const row of message.rows) textLines.push(`${row.label}: ${row.value}`);
    textLines.push("");
  }
  if (message.button) textLines.push(`${message.button.label}: ${message.button.href}`, "");
  if (message.attachment) textLines.push(`Attached: ${message.attachment.filename} (${message.attachment.sizeLabel})`, "");
  if (message.note) textLines.push(message.note, "");
  textLines.push(...footerLines(message));

  return { subject, html, text: textLines.join("\n") };
}

/** "84 KB" from a base64 payload, for the attachment chip. */
export function attachmentSizeLabel(base64Length: number): string {
  const bytes = Math.floor((base64Length * 3) / 4);
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
