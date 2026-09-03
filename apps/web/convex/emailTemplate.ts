/**
 * The RIVET transactional email template.
 *
 * One column at 600px, a small lockup on paper, one headline, one action and
 * a complete footer, in the manner of an account receipt rather than a
 * marketing send. The markup is table-based with inline styles because mail
 * clients are not browsers; the only stylesheet is the dark-mode block, which
 * clients that ignore it simply render light.
 *
 * No Convex imports: the mock adapter and the tests render the same bytes.
 */
import { BRAND, BRAND_CONTACT, BRAND_PLACEHOLDERS, BRAND_YEAR } from "./brandTokens";

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
    `${BRAND_CONTACT.phone} · ${BRAND_CONTACT.whatsapp} · ${BRAND_CONTACT.instagram} · ${BRAND_CONTACT.website}`,
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
  lines.push(arabic ? BRAND_PLACEHOLDERS.legalEntityAr : BRAND_PLACEHOLDERS.legalEntity);
  return lines;
}

function footerHtml(message: BrandedEmail, origin: string): string {
  const arabic = message.language === "ar";
  const font = arabic ? SANS_AR : SANS;
  const [contact, channels, hours, , why, copyright, legal] = footerLines(message);
  const link = (label: string, path: string) => `<a href="${origin}${path}" style="color:${BRAND.inkMuted};text-decoration:underline">${escapeHtml(label)}</a>`;
  const links = [link(arabic ? "سياسة الخصوصية" : "Privacy policy", "/privacy"), link(arabic ? "شروط الخدمة" : "Terms of service", "/terms")];
  if (message.audience === "gym") links.push(link(arabic ? "تفضيلات البريد" : "Email preferences", "/settings?section=email"));
  return `<tr><td class="rv-footer" style="background:${BRAND.sunken};border-top:1px solid ${BRAND.line};padding:24px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td valign="top" width="32" style="padding-${arabic ? "left" : "right"}:12px"><img src="${origin}/brand/rivet-glyph.png" width="14" alt="" class="rv-logo-light" style="height:20px;width:auto;display:block;border:0"><img src="${origin}/brand/rivet-glyph-rev.png" width="14" alt="" class="rv-logo-dark" style="height:20px;width:auto;display:none;border:0"></td>
<td valign="top" class="rv-muted" style="font-family:${font};font-size:12px;line-height:1.6;color:${BRAND.inkMuted}">
<div>${escapeHtml(contact!)}</div>
<div>${escapeHtml(channels!)}</div>
<div>${escapeHtml(hours!)}</div>
<div style="padding-top:8px">${links.join(" · ")}</div>
<div style="padding-top:8px">${escapeHtml(why!)}</div>
<div style="padding-top:8px">${escapeHtml(copyright!)}</div>
<div style="color:${BRAND.inkDisabled}">${escapeHtml(legal!)}</div>
</td></tr></table></td></tr>`;
}

function rowsHtml(rows: EmailRow[], arabic: boolean): string {
  const font = arabic ? SANS_AR : SANS;
  const start = arabic ? "right" : "left";
  const end = arabic ? "left" : "right";
  const cells = rows.map((row, index) => {
    const border = index === rows.length - 1 ? "" : `border-bottom:1px solid ${BRAND.line};`;
    const valueStyle = row.mono
      ? `font-family:${MONO};font-size:13px;`
      : `font-family:${font};font-size:15px;${row.strong ? "font-weight:600;" : ""}`;
    return `<tr>
<td class="rv-muted" align="${start}" style="${border}padding:12px 16px;font-family:${font};font-size:13px;color:${BRAND.inkMuted};">${escapeHtml(row.label)}</td>
<td class="rv-ink" align="${end}" style="${border}padding:12px 16px;${valueStyle}color:${BRAND.ink};word-break:break-word">${escapeHtml(row.value)}</td>
</tr>`;
  });
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="rv-card" style="border:1px solid ${BRAND.line};border-radius:8px;background:${BRAND.surface}">${cells.join("")}</table>`;
}

function buttonHtml(button: { label: string; href: string }, accent: string | undefined, arabic: boolean): string {
  const background = accent ?? BRAND.ink;
  const colour = accent ? "#FFFFFF" : BRAND.paper;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="rv-button" align="center" bgcolor="${background}" style="border-radius:6px;background:${background}">
<a href="${escapeHtml(button.href)}" class="rv-button-link" style="display:inline-block;height:44px;line-height:44px;padding:0 24px;font-family:${arabic ? SANS_AR : SANS};font-size:15px;font-weight:600;color:${colour};text-decoration:none;border-radius:6px">${escapeHtml(button.label)}</a>
</td></tr></table>`;
}

function attachmentHtml(attachment: { filename: string; sizeLabel: string }, arabic: boolean): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="rv-chip" style="background:${BRAND.paper};border-radius:4px;padding:8px 12px;font-family:${MONO};font-size:13px;color:${BRAND.ink}">
<span style="display:inline-block;width:11px;height:14px;border:1.5px solid ${BRAND.ink};border-radius:2px;vertical-align:-2px;margin-${arabic ? "left" : "right"}:10px"></span>${escapeHtml(attachment.filename)}
<span class="rv-muted" style="font-family:${arabic ? SANS_AR : SANS};font-size:12px;color:${BRAND.inkMuted};padding-${arabic ? "right" : "left"}:8px">${escapeHtml(attachment.sizeLabel)}</span>
</td></tr></table>`;
}

function statusHtml(status: { label: string; tone: EmailStatusTone }, arabic: boolean): string {
  const colours = STATUS_COLOURS[status.tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${colours.background};border-radius:4px;padding:4px 8px;font-family:${arabic ? SANS_AR : SANS};font-size:12px;font-weight:600;color:${colours.ink}">${escapeHtml(status.label)}</td></tr></table>`;
}

const DARK_MODE_CSS = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
.rv-body{background:${BRAND.night}!important}
.rv-frame{background:${BRAND.nightRaised}!important;border-color:${BRAND.nightLine}!important}
.rv-header{background:${BRAND.night}!important;border-color:${BRAND.nightLine}!important}
.rv-panel{background:${BRAND.nightRaised}!important}
.rv-footer{background:${BRAND.night}!important;border-color:${BRAND.nightLine}!important}
.rv-ink,.rv-headline{color:${BRAND.nightInk}!important}
.rv-secondary,.rv-muted,.rv-muted a{color:${BRAND.nightInkSecondary}!important}
.rv-card{background:${BRAND.nightRaised}!important;border-color:${BRAND.nightLine}!important}
.rv-card td{border-color:${BRAND.nightLine}!important}
.rv-chip{background:${BRAND.nightRaised}!important;color:${BRAND.nightInk}!important}
.rv-button,.rv-button a{background:${BRAND.nightInk}!important;color:${BRAND.night}!important}
.rv-logo-light{display:none!important}
.rv-logo-dark{display:block!important}
}
@media only screen and (max-width:480px){
.rv-pad{padding-left:20px!important;padding-right:20px!important}
.rv-button,.rv-button a{width:100%!important;text-align:center!important}
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
  if (message.rows?.length) blocks.push(rowsHtml(message.rows, arabic));
  if (message.button) blocks.push(buttonHtml(message.button, message.audience === "member" ? message.accent : undefined, arabic));
  if (message.attachment) blocks.push(attachmentHtml(message.attachment, arabic));
  if (message.note) blocks.push(`<div class="rv-secondary" style="font-family:${font};font-size:14px;line-height:1.55;color:${BRAND.inkSecondary}">${escapeHtml(message.note)}</div>`);

  const body = blocks.map((block) => `<tr><td style="padding-bottom:20px">${block}</td></tr>`).join("");

  const html = `<!doctype html>
<html dir="${direction}" lang="${message.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title><style>${DARK_MODE_CSS}</style></head>
<body class="rv-body" style="margin:0;padding:0;background:${BRAND.sunken}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(message.paragraphs[0] ?? subject)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="rv-body" style="background:${BRAND.sunken}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="rv-frame" style="width:600px;max-width:100%;background:${BRAND.surface};border:1px solid ${BRAND.lineStrong}" dir="${direction}">
<tr><td class="rv-header rv-pad" align="${start}" style="background:${BRAND.paper};border-bottom:1px solid ${BRAND.line};padding:32px">
<img src="${origin}/brand/rivet-lockup.png" width="112" alt="RIVET" class="rv-logo-light" style="width:112px;height:auto;display:block;border:0">
<img src="${origin}/brand/rivet-lockup-rev.png" width="112" alt="RIVET" class="rv-logo-dark" style="width:112px;height:auto;display:none;border:0">
${message.gymName ? `<div class="rv-muted" style="font-family:${font};font-size:13px;color:${BRAND.inkMuted};padding-top:12px">${escapeHtml(message.gymName)}</div>` : ""}
</td></tr>
<tr><td class="rv-pad" align="${start}" style="padding:32px 32px 12px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${body}</table></td></tr>
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
