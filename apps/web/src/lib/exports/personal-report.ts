export type PersonalReportValue = string | number | boolean | null | undefined;

export interface PersonalReportField {
  label: string;
  value: PersonalReportValue;
}

export interface PersonalReportSection {
  title: string;
  description?: string;
  headers: string[];
  rows: PersonalReportValue[][];
  emptyMessage?: string;
}

function text(value: PersonalReportValue): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function escapeHtml(value: PersonalReportValue): string {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSection(section: PersonalReportSection): string {
  const body = section.rows.length > 0
    ? section.rows.map((row) => `<tr>${section.headers.map((_, index) => `<td>${escapeHtml(row[index])}</td>`).join("")}</tr>`).join("")
    : `<tr><td class="empty" colspan="${section.headers.length}">${escapeHtml(section.emptyMessage ?? "No records")}</td></tr>`;

  return `<section class="section">
    <div class="section-heading">
      <h2>${escapeHtml(section.title)}</h2>
      ${section.description ? `<p>${escapeHtml(section.description)}</p>` : ""}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

/** Builds a standalone report that opens cleanly in any modern browser. */
export function buildPersonalDataHtmlReport(input: {
  memberName: string;
  generatedAt: string;
  account: string;
  includedGyms: string;
  profile: PersonalReportField[];
  sections: PersonalReportSection[];
}): string {
  const profile = input.profile
    .filter((field) => field.value !== undefined && field.value !== null && field.value !== "")
    .map((field) => `<div class="fact"><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value)}</dd></div>`)
    .join("");

  return `<!doctype html>
<html lang="en" dir="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(input.memberName)} — RIVET data</title>
  <style>
    :root { color-scheme: light; --paper:#fff; --canvas:#f4f2ed; --ink:#1c1c19; --muted:#706d64; --line:#ddd8cc; --soft:#f8f7f3; --accent:#b62518; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--canvas); color:var(--ink); font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; line-height:1.45; }
    main { width:min(1120px,calc(100% - 32px)); margin:32px auto; background:var(--paper); border:1px solid var(--line); }
    header { padding:36px 40px 30px; border-bottom:1px solid var(--line); }
    .brand { font-size:13px; font-weight:800; letter-spacing:.34em; }
    .eyebrow { margin:30px 0 7px; color:var(--accent); font-size:10px; font-weight:750; letter-spacing:.2em; text-transform:uppercase; }
    h1 { margin:0; font-size:clamp(28px,4vw,46px); line-height:1.04; letter-spacing:-.035em; }
    .intro { max-width:700px; margin:12px 0 0; color:var(--muted); font-size:14px; }
    .meta { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1px; margin-top:26px; border:1px solid var(--line); background:var(--line); }
    .meta div { min-width:0; padding:13px 15px; background:var(--soft); }
    .meta span, dt { display:block; color:var(--muted); font-size:10px; font-weight:700; letter-spacing:.11em; text-transform:uppercase; }
    .meta strong { display:block; margin-top:4px; overflow-wrap:anywhere; font-size:13px; }
    .profile { padding:30px 40px; border-bottom:1px solid var(--line); }
    h2 { margin:0; font-size:20px; letter-spacing:-.02em; }
    .facts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 30px; margin-top:17px; }
    .fact { padding:11px 0; border-top:1px solid var(--line); }
    dd { margin:5px 0 0; overflow-wrap:anywhere; font-size:13px; }
    .section { padding:30px 40px; border-bottom:1px solid var(--line); }
    .section:last-child { border-bottom:0; }
    .section-heading { display:flex; align-items:end; justify-content:space-between; gap:20px; margin-bottom:14px; }
    .section-heading p { max-width:540px; margin:0; color:var(--muted); font-size:12px; text-align:right; }
    .table-wrap { overflow-x:auto; border:1px solid var(--line); }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th { padding:10px 12px; background:var(--soft); color:var(--muted); font-size:9px; letter-spacing:.1em; text-align:left; text-transform:uppercase; white-space:nowrap; }
    td { padding:11px 12px; border-top:1px solid var(--line); vertical-align:top; white-space:nowrap; }
    td:nth-child(n+4) { white-space:normal; }
    .empty { color:var(--muted); font-style:italic; text-align:center; }
    footer { padding:22px 40px; border-top:1px solid var(--line); color:var(--muted); font-size:11px; }
    @media (max-width:720px) {
      main { width:100%; margin:0; border:0; }
      header,.profile,.section,footer { padding-left:20px; padding-right:20px; }
      .meta,.facts { grid-template-columns:1fr; }
      .section-heading { display:block; }
      .section-heading p { margin-top:5px; text-align:left; }
    }
    @media print {
      body { background:#fff; }
      main { width:100%; margin:0; border:0; }
      .section { break-inside:avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand">RIVET</div>
      <p class="eyebrow">Personal data report</p>
      <h1>${escapeHtml(input.memberName)}</h1>
      <p class="intro">A readable copy of the personal, membership, payment, attendance, and account information currently recorded for you in RIVET.</p>
      <div class="meta">
        <div><span>Generated</span><strong>${escapeHtml(input.generatedAt)}</strong></div>
        <div><span>Account</span><strong>${escapeHtml(input.account)}</strong></div>
        <div><span>Gyms included</span><strong>${escapeHtml(input.includedGyms)}</strong></div>
      </div>
    </header>
    <section class="profile">
      <h2>Profile</h2>
      <dl class="facts">${profile || '<div class="fact"><dd>No profile details recorded.</dd></div>'}</dl>
    </section>
    ${input.sections.map(renderSection).join("\n    ")}
    <footer>This report contains your RIVET data as recorded when it was generated. Contact the relevant gym if a gym-owned record needs correction.</footer>
  </main>
</body>
</html>`;
}
