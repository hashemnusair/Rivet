import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const webDir = join(rootDir, "apps", "web");
const requireFromWeb = createRequire(join(webDir, "package.json"));
const { chromium } = requireFromWeb("@playwright/test");
const port = 3177;
const baseUrl = `http://127.0.0.1:${port}`;

const paths = {
  owner: join(webDir, "e2e", "__screenshots__", "owner-dashboard-desktop.png"),
  reception: join(webDir, "e2e", "__screenshots__", "reception-tablet.png"),
  member: join(webDir, "e2e", "__screenshots__", "member-finance-phone.png"),
  outputIdentity: join(rootDir, "docs", "brand", "rivet-product-identity-system.png"),
  outputApplication: join(rootDir, "docs", "brand", "rivet-product-application-system.png"),
};

function asDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function waitForServer(url, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const sharedCss = `
  :root {
    --board-paper: #f5f4ef;
    --board-surface: #ffffff;
    --board-sunken: #edece5;
    --board-sunken-2: #e4e2d8;
    --board-ink: #1b1a15;
    --board-ink-2: #565449;
    --board-ink-3: #8b887b;
    --board-line: #e3e1d6;
    --board-line-2: #d2cfc2;
    --board-night: #15140f;
    --board-night-2: #1e1c15;
    --board-night-3: #2a2820;
    --board-night-ink: #f2f0e6;
    --board-night-ink-2: #a6a394;
    --board-signal: #d9232b;
    --board-signal-deep: #ad1b22;
    --board-success: #176e44;
    --board-success-soft: #e6f1ea;
    --board-warning: #96620a;
    --board-warning-soft: #f7edd9;
  }
  * { box-sizing: border-box; }
  html, body { width: 3840px; height: 2400px; margin: 0; overflow: hidden; }
  body {
    background: var(--board-paper);
    color: var(--board-ink);
    font-family: var(--font-product), Manrope, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  nextjs-portal { display: none !important; }
  .board {
    position: relative;
    width: 3840px;
    height: 2400px;
    overflow: hidden;
    isolation: isolate;
  }
  .board::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 20;
    pointer-events: none;
    opacity: .18;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.025'/%3E%3C/svg%3E");
    mix-blend-mode: multiply;
  }
  .board-kicker {
    color: var(--board-ink-2);
    font-size: 24px;
    font-weight: 600;
    letter-spacing: .01em;
  }
  .board-index {
    font-family: var(--font-product-mono), "IBM Plex Mono", monospace;
    font-size: 20px;
    font-weight: 500;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .hairline { border-color: var(--board-line); }
`;

const identityHtml = `
  <main class="board identity-board">
    <header class="identity-head">
      <img src="/brand/rivet-lockup.png" alt="RIVET" class="identity-lockup" />
      <div class="identity-title">
        <span class="board-kicker">Product identity system</span>
        <span class="board-index">01 / Quiet operations ledger</span>
      </div>
    </header>

    <section class="identity-statement">
      <p>Calm enough for daily repetition.<br />Exact enough for money and accountability.</p>
      <div class="identity-note">
        Warm paper, strong ink, hairline structure and one deliberate signal.
        RIVET is an operating instrument—not a decorative dashboard.
      </div>
    </section>

    <section class="identity-grid">
      <article class="palette-block">
        <div class="section-line"><span class="board-index">Color</span><span>Five operating roles</span></div>
        <div class="swatches">
          <div class="swatch swatch-paper"><span>Ledger paper</span><code>#F5F4EF</code></div>
          <div class="swatch swatch-surface"><span>Record surface</span><code>#FFFFFF</code></div>
          <div class="swatch swatch-ink"><span>Ledger ink</span><code>#1B1A15</code></div>
          <div class="swatch swatch-signal"><span>RIVET signal</span><code>#D9232B</code></div>
          <div class="swatch swatch-success"><span>Success</span><code>#176E44</code></div>
        </div>
        <p class="palette-rule">One signal rule: red is rare enough to remain meaningful.</p>
      </article>

      <article class="type-block">
        <div class="section-line"><span class="board-index">Type</span><span>Human language / machine records</span></div>
        <div class="type-display">Manrope</div>
        <p class="type-sample">Members, money and momentum—clear at a glance.</p>
        <div class="type-meta">
          <span>Page / 26 · 600</span><span>Body / 14 · 400</span><span>Compact / 13.5 · 400</span>
        </div>
        <div class="mono-row">
          <span>IBM Plex Mono</span>
          <code>RV-001042 · JOD 85.000 · MAIN-1038</code>
        </div>
      </article>

      <article class="geometry-block">
        <div class="section-line"><span class="board-index">Structure</span><span>Flat at rest</span></div>
        <div class="geometry-demo">
          <div class="radius-demo radius-three"><span>3</span></div>
          <div class="radius-demo radius-four"><span>4</span></div>
          <div class="radius-demo radius-six"><span>6</span></div>
          <div class="radius-demo radius-eight"><span>8px</span></div>
        </div>
        <div class="spacing-demo">
          <span style="width:8px"></span><span style="width:12px"></span><span style="width:16px"></span>
          <span style="width:24px"></span><span style="width:32px"></span><span style="width:48px"></span>
        </div>
        <p>One meaningful boundary. Dividers and spacing do the rest.</p>
      </article>

      <article class="night-block">
        <div class="section-line section-line-night"><span class="board-index">Night</span><span>Focused operating mode</span></div>
        <nav class="mini-night-nav" aria-label="Example">
          <span>Dashboard</span><strong>Members</strong><span>Classes</span>
        </nav>
        <div class="night-copy"><b>Not a dark theme.</b><span>Reserved for navigation, authentication and reception focus.</span></div>
      </article>
    </section>

    <section class="identity-components">
      <div class="section-line"><span class="board-index">Components</span><span>One family, clear priority</span></div>
      <div class="component-strip">
        <button class="sample-primary">Save changes</button>
        <button class="sample-secondary">View receipt</button>
        <button class="sample-signal">Add member</button>
        <label class="sample-field"><span>Member phone</span><b>+962 79 123 4567</b></label>
        <span class="sample-status"><i></i>Payment posted</span>
        <span class="sample-nav">Payments</span>
      </div>
    </section>

    <footer class="identity-footer">
      <div class="do-block"><b>DO</b><span>Sentence case</span><span>Tabular money</span><span>Quiet active states</span><span>Visible next actions</span></div>
      <div class="dont-block"><b>DON’T</b><span>Decorative eyebrows</span><span>Colored active rails</span><span>Nested card walls</span><span>Generic gradients</span></div>
      <div class="identity-signoff"><span>RIVET / Product system</span><span>Amman · 2026</span></div>
    </footer>
  </main>
`;

const identityCss = `
  ${sharedCss}
  .identity-board { padding: 106px 120px 104px; }
  .identity-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 62px; border-bottom: 2px solid var(--board-ink); }
  .identity-lockup { width: 520px; height: auto; object-fit: contain; }
  .identity-title { display: flex; align-items: end; gap: 52px; }
  .identity-title .board-index { color: var(--board-ink-3); }
  .identity-statement { display: grid; grid-template-columns: 2.15fr .85fr; gap: 120px; padding: 74px 0 82px; align-items: end; }
  .identity-statement > p { margin: 0; max-width: 2350px; font-size: 102px; line-height: 1.02; letter-spacing: -.045em; font-weight: 580; }
  .identity-note { border-left: 2px solid var(--board-signal); padding-left: 30px; color: var(--board-ink-2); font-size: 27px; line-height: 1.5; }
  .identity-grid { display: grid; grid-template-columns: 1.06fr 1.42fr .92fr .82fr; border: 1px solid var(--board-line-2); background: var(--board-surface); }
  .identity-grid article { min-width: 0; height: 738px; padding: 42px 44px; border-right: 1px solid var(--board-line); }
  .identity-grid article:last-child { border-right: 0; }
  .section-line { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; padding-bottom: 28px; border-bottom: 1px solid var(--board-line); color: var(--board-ink-3); font-size: 22px; }
  .section-line .board-index { color: var(--board-ink); }
  .swatches { display: grid; grid-template-columns: repeat(5, 1fr); height: 430px; margin-top: 36px; border: 1px solid var(--board-line); }
  .swatch { display: flex; flex-direction: column; justify-content: space-between; padding: 24px 18px; min-width: 0; font-size: 20px; border-right: 1px solid rgb(27 26 21 / .08); }
  .swatch:last-child { border-right: 0; }
  .swatch code { font-family: var(--font-product-mono), "IBM Plex Mono", monospace; font-size: 16px; }
  .swatch-surface { background: #fff; }.swatch-paper { background:#f5f4ef; }.swatch-ink { background:#1b1a15;color:#f2f0e6; }
  .swatch-signal { background:#d9232b;color:#fff; }.swatch-success { background:#176e44;color:#fff; }
  .palette-rule { margin: 28px 0 0; color: var(--board-ink-2); font-size: 21px; line-height: 1.4; }
  .type-display { margin-top: 32px; font-size: 120px; font-weight: 600; letter-spacing: -.05em; line-height: 1; }
  .type-sample { margin: 30px 0 20px; max-width: 920px; font-size: 38px; line-height: 1.3; letter-spacing: -.02em; }
  .type-meta { display: flex; gap: 34px; color: var(--board-ink-3); font-size: 18px; }
  .mono-row { display: grid; gap: 14px; margin-top: 64px; padding-top: 30px; border-top: 1px solid var(--board-line); }
  .mono-row span { font-size: 24px; font-weight: 600; }
  .mono-row code { color: var(--board-ink-2); font-family: var(--font-product-mono), "IBM Plex Mono", monospace; font-size: 19px; }
  .geometry-demo { display: flex; align-items: end; gap: 18px; margin-top: 55px; }
  .radius-demo { display:grid;place-items:center;background:var(--board-sunken);border:1px solid var(--board-line-2);color:var(--board-ink-2);font-size:18px;}
  .radius-three{width:86px;height:86px;border-radius:3px}.radius-four{width:102px;height:102px;border-radius:4px}.radius-six{width:122px;height:122px;border-radius:6px}.radius-eight{width:146px;height:146px;border-radius:8px}
  .spacing-demo { display: flex; align-items: end; gap: 18px; height: 160px; margin-top: 54px; padding-bottom: 18px; border-bottom: 1px solid var(--board-line); }
  .spacing-demo span { display: block; height: 82px; background: var(--board-ink); }
  .geometry-block p { color: var(--board-ink-2); font-size: 21px; line-height: 1.45; }
  .night-block { background: var(--board-night); color: var(--board-night-ink); }
  .section-line-night { color: var(--board-night-ink-2); border-color: #2e2c22; }
  .section-line-night .board-index { color: var(--board-night-ink); }
  .mini-night-nav { display: grid; gap: 10px; margin-top: 44px; font-size: 27px; }
  .mini-night-nav span, .mini-night-nav strong { padding: 20px 24px; border-radius: 6px; color: var(--board-night-ink-2); font-weight: 450; }
  .mini-night-nav strong { color: var(--board-night-ink); background: var(--board-night-3); font-weight: 600; }
  .night-copy { display: grid; gap: 14px; margin-top: 74px; padding-top: 34px; border-top: 1px solid #2e2c22; }
  .night-copy b { font-size: 29px; }.night-copy span { color: var(--board-night-ink-2); font-size: 21px; line-height: 1.5; }
  .identity-components { padding: 42px 44px 48px; border: 1px solid var(--board-line-2); border-top: 0; background: var(--board-surface); }
  .component-strip { display: flex; align-items: center; gap: 30px; padding-top: 38px; }
  .component-strip button { height: 64px; padding: 0 28px; border-radius: 6px; font: 600 22px Manrope,system-ui,sans-serif; }
  .sample-primary { border:0;background:var(--board-ink);color:var(--board-paper);}.sample-secondary{border:1px solid var(--board-line-2);background:white;color:var(--board-ink)}.sample-signal{border:0;background:var(--board-signal);color:white}
  .sample-field { display:grid; gap:8px; min-width:420px; padding:15px 20px; border:1px solid var(--board-line-2); border-radius:6px; }
  .sample-field span { color:var(--board-ink-3);font-size:17px}.sample-field b{font-size:23px;font-weight:500}
  .sample-status { display:inline-flex;align-items:center;gap:10px;padding:9px 14px;border-radius:4px;background:var(--board-success-soft);color:#0f5232;font-size:19px;font-weight:600}.sample-status i{width:9px;height:9px;border-radius:50%;background:var(--board-success)}
  .sample-nav { padding: 18px 24px; border-radius: 6px; background: var(--board-sunken); font-size:22px;font-weight:600; }
  .identity-footer { display:grid;grid-template-columns:1fr 1fr .72fr;gap:60px;padding-top:50px; }
  .do-block,.dont-block { display:flex;align-items:center;gap:30px;color:var(--board-ink-2);font-size:18px}.do-block b{color:var(--board-success)}.dont-block b{color:var(--board-signal)}.do-block span,.dont-block span{padding-right:30px;border-right:1px solid var(--board-line-2)}.do-block span:last-child,.dont-block span:last-child{border-right:0}
  .identity-signoff { display:flex;justify-content:flex-end;gap:26px;color:var(--board-ink-3);font-family:var(--font-product-mono),"IBM Plex Mono",monospace;font-size:16px;text-transform:uppercase;letter-spacing:.1em}
`;

const applicationHtml = ({ owner, reception, member }) => `
  <main class="board application-board">
    <header class="application-head">
      <div>
        <img src="/brand/rivet-lockup-rev.png" alt="RIVET" />
        <span>Product application system</span>
      </div>
      <p>One operating language.<br />Three working contexts.</p>
      <span class="board-index">02 / Applied product</span>
    </header>

    <section class="app-canvas">
      <figure class="owner-frame">
        <div class="frame-meta"><span>Owner workspace</span><code>Branch-wide overview</code></div>
        <img src="${owner}" alt="Synthetic RIVET owner dashboard" />
      </figure>

      <aside class="application-principles">
        <div><b>01</b><span>Likely next action stays visible.</span></div>
        <div><b>02</b><span>Money reads with tabular precision.</span></div>
        <div><b>03</b><span>Errors say what to do next.</span></div>
      </aside>

      <figure class="reception-frame">
        <div class="frame-meta frame-meta-night"><span>Night reception</span><code>Fast · focused · touch-ready</code></div>
        <img src="${reception}" alt="Synthetic RIVET reception workspace" />
      </figure>

      <figure class="member-frame">
        <div class="phone-shell"><img src="${member}" alt="Synthetic RIVET member finance screen" /></div>
        <figcaption><span>Member mobile</span><code>One-hand finance</code></figcaption>
      </figure>

      <section class="application-ledger">
        <div class="ledger-head"><span>Financial record</span><strong>Posted</strong></div>
        <div class="ledger-number">RV-001042</div>
        <div class="ledger-person"><span>Payment from</span><b>Samira Haddad</b></div>
        <div class="ledger-amount"><span>Total</span><b>JOD 85.000</b></div>
        <div class="ledger-foot"><span>Cash · Main branch</span><span>03 Sep 2026 · 16:42</span></div>
      </section>

      <section class="tenant-sample">
        <div class="tenant-mark">N</div>
        <div><span>Controlled tenant accent</span><b>Nadi Amman</b></div>
        <button type="button">Add member</button>
      </section>

      <section class="state-strip">
        <div class="state-head"><span>Operational states</span><code>Specific · recoverable · quiet</code></div>
        <div class="states">
          <span class="state-success"><i></i>Checked in</span>
          <span class="state-warning"><i></i>Balance due</span>
          <span class="state-neutral"><i></i>Waiting</span>
          <button type="button">Retry</button>
        </div>
      </section>
    </section>

    <footer class="application-footer">
      <span>Warm paper / Night focus / Tenant signal / Exact records</span>
      <span>RIVET product system · Amman · 2026</span>
    </footer>
  </main>
`;

const applicationCss = `
  ${sharedCss}
  .application-board { background: var(--board-night); color: var(--board-night-ink); }
  .application-head { height: 330px; display:grid;grid-template-columns:1.15fr 1.5fr .8fr;align-items:center;gap:80px;padding:70px 110px;border-bottom:1px solid #2e2c22; }
  .application-head > div { display:flex;align-items:center;gap:38px}.application-head img{width:390px;height:auto}.application-head > div span{color:var(--board-night-ink-2);font-size:24px}
  .application-head p { margin:0;font-size:55px;line-height:1.08;letter-spacing:-.035em;font-weight:560}.application-head > .board-index{text-align:right;color:var(--board-night-ink-2)}
  .app-canvas { position:relative;height:1930px;margin:0 64px;background:var(--board-paper);color:var(--board-ink);overflow:hidden; }
  .owner-frame { position:absolute;left:54px;top:54px;width:2470px;height:1110px;margin:0;overflow:hidden;border:1px solid var(--board-line-2);background:white; }
  .frame-meta { height:90px;display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:1px solid var(--board-line);font-size:24px;font-weight:600}
  .frame-meta code { color:var(--board-ink-3);font-family:var(--font-product-mono),"IBM Plex Mono",monospace;font-size:17px;text-transform:uppercase;letter-spacing:.08em;font-weight:500}
  .owner-frame img { width:100%;height:1020px;object-fit:cover;object-position:top left;display:block; }
  .application-principles { position:absolute;left:2580px;top:54px;right:54px;height:380px;display:grid;border-top:1px solid var(--board-line-2); }
  .application-principles div{display:grid;grid-template-columns:70px 1fr;align-items:center;border-bottom:1px solid var(--board-line-2);font-size:27px;line-height:1.35}.application-principles b{font-family:var(--font-product-mono),"IBM Plex Mono",monospace;color:var(--board-signal);font-size:18px}
  .reception-frame { position:absolute;left:54px;top:1218px;width:1990px;height:625px;margin:0;overflow:hidden;border:1px solid #2e2c22;background:var(--board-night); }
  .frame-meta-night { color:var(--board-night-ink);border-color:#2e2c22;background:var(--board-night);}.frame-meta-night code{color:var(--board-night-ink-2)}
  .reception-frame img { width:100%;height:535px;object-fit:cover;object-position:top center;display:block;filter:saturate(.94) contrast(1.01); }
  .member-frame { position:absolute;left:2600px;top:470px;width:530px;height:980px;margin:0; }
  .phone-shell { width:430px;height:930px;margin:auto;padding:11px;border-radius:42px;background:#1b1a15;box-shadow:0 22px 62px rgb(27 26 21 / .22); }
  .phone-shell img { width:100%;height:100%;display:block;object-fit:cover;object-position:top;border-radius:32px; }
  .member-frame figcaption{position:absolute;left:0;right:0;bottom:-70px;display:flex;justify-content:space-between;align-items:center;font-size:22px;font-weight:600}.member-frame code{color:var(--board-ink-3);font-family:var(--font-product-mono),"IBM Plex Mono",monospace;font-size:15px;text-transform:uppercase;letter-spacing:.08em}
  .application-ledger { position:absolute;left:3170px;right:54px;top:470px;height:590px;padding:34px;border:1px solid var(--board-line-2);background:white; }
  .ledger-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:28px;border-bottom:1px solid var(--board-line);font-size:24px;font-weight:600}.ledger-head strong{padding:7px 12px;border-radius:4px;background:var(--board-success-soft);color:#0f5232;font-size:17px}
  .ledger-number{padding:26px 0;color:var(--board-ink-3);font-family:var(--font-product-mono),"IBM Plex Mono",monospace;font-size:18px}
  .ledger-person,.ledger-amount{display:flex;justify-content:space-between;align-items:baseline;padding:24px 0;border-top:1px solid var(--board-line);font-size:20px}.ledger-person b{font-size:25px}.ledger-amount b{font-size:35px;font-variant-numeric:tabular-nums}
  .ledger-foot{display:grid;gap:8px;padding-top:24px;border-top:1px solid var(--board-line);color:var(--board-ink-3);font-size:17px}
  .tenant-sample { position:absolute;left:3170px;right:54px;top:1100px;height:350px;display:grid;grid-template-columns:84px 1fr;grid-template-rows:1fr auto;gap:24px;padding:34px;border:1px solid var(--board-line-2);background:white; }
  .tenant-mark{display:grid;place-items:center;width:84px;height:84px;border-radius:8px;background:#0c6b61;color:white;font-size:35px;font-weight:650}.tenant-sample>div:nth-child(2){display:grid;align-content:center;gap:7px}.tenant-sample span{color:var(--board-ink-3);font-size:16px}.tenant-sample b{font-size:27px}.tenant-sample button{grid-column:1/-1;height:66px;border:0;border-radius:6px;background:#0c6b61;color:white;font:600 23px Manrope,system-ui,sans-serif}
  .state-strip { position:absolute;left:2100px;right:54px;top:1575px;height:268px;padding:28px 34px;border:1px solid var(--board-line-2);background:white; }
  .state-head{display:flex;justify-content:space-between;padding-bottom:24px;border-bottom:1px solid var(--board-line);font-size:22px;font-weight:600}.state-head code{color:var(--board-ink-3);font-family:var(--font-product-mono),"IBM Plex Mono",monospace;font-size:15px;text-transform:uppercase;letter-spacing:.08em}
  .states{display:flex;align-items:center;gap:26px;padding-top:34px}.states span{display:inline-flex;align-items:center;gap:10px;padding:10px 15px;border-radius:4px;font-size:18px;font-weight:600}.states i{width:9px;height:9px;border-radius:50%}.state-success{color:#0f5232;background:var(--board-success-soft)}.state-success i{background:var(--board-success)}.state-warning{color:#6f4804;background:var(--board-warning-soft)}.state-warning i{background:var(--board-warning)}.state-neutral{color:var(--board-ink-2);background:var(--board-sunken)}.state-neutral i{background:var(--board-ink-3)}.states button{height:46px;padding:0 20px;border:1px solid var(--board-line-2);border-radius:6px;background:white;font:600 18px Manrope,system-ui,sans-serif}
  .application-footer { height:140px;display:flex;align-items:center;justify-content:space-between;padding:0 110px;color:var(--board-night-ink-2);font-size:18px;letter-spacing:.02em}.application-footer span:last-child{font-family:var(--font-product-mono),"IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.1em;font-size:15px}
`;

const server = spawn("pnpm", ["exec", "next", "dev", "--webpack", "-p", String(port)], {
  cwd: webDir,
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-playwright",
    NEXT_PUBLIC_RIVET_DEMO_AUTH: "1",
    NEXT_PUBLIC_DATA_MODE: "mock",
    RIVET_DESIGN_PREVIEW: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

let browser;
try {
  await waitForServer(`${baseUrl}/dev/design-system`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 3840, height: 2400 }, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/dev/design-system`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  async function renderBoard(html, css, outputPath) {
    await page.evaluate(({ markup, styles }) => {
      document.title = "RIVET product identity";
      document.body.innerHTML = markup;
      document.querySelectorAll("style[data-brand-board]").forEach((element) => element.remove());
      const style = document.createElement("style");
      style.dataset.brandBoard = "true";
      style.textContent = styles;
      document.head.appendChild(style);
    }, { markup: html, styles: css });
    await page.waitForFunction(() =>
      Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: outputPath,
      clip: { x: 0, y: 0, width: 3840, height: 2400 },
      animations: "disabled",
    });
  }

  await renderBoard(identityHtml, identityCss, paths.outputIdentity);

  const [owner, reception, member] = await Promise.all([
    readFile(paths.owner).then(asDataUrl),
    readFile(paths.reception).then(asDataUrl),
    readFile(paths.member).then(asDataUrl),
  ]);
  await renderBoard(applicationHtml({ owner, reception, member }), applicationCss, paths.outputApplication);
} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

console.log("Rendered 3840×2400 RIVET product brand boards.");
