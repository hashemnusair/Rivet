/*
 * RIVET hero film — a 36-second loop of the product, rendered from a clock.
 *
 * Every visible value is a pure function of `t` (seconds), so `film.seek(t)`
 * produces the same frame every time. render.mjs steps the clock and pipes the
 * frames to ffmpeg; `?play` runs it live for review. The script (shot list) is
 * in README.md. Screens are traced from the product's own routes (reception,
 * classes, payments, leads, member profile, owner dashboard) with the seeded
 * demo names, drawn in the product's night tokens.
 */
(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const FORMAT = params.get("format") === "portrait" ? "portrait" : "landscape";
  const PORTRAIT = FORMAT === "portrait";
  const W = PORTRAIT ? 1080 : 1920;
  const H = PORTRAIT ? 1920 : 1080;
  const T = 36;

  // ------------------------------------------------------------------ math
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const ease = {
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    out: (k) => 1 - Math.pow(1 - k, 3),
    outQuint: (k) => 1 - Math.pow(1 - k, 5),
    sine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
    outBack: (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2),
  };
  const tw = (t, a, b, from, to, fn = ease.inOut) => lerp(from, to, fn(seg(t, a, b)));
  /** Picks the landscape or portrait value. */
  const fmt = (landscape, portrait) => (PORTRAIT ? portrait : landscape);

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Catmull-Rom through camera keys so the drift never stops at a key. */
  const CAM_FIELDS = ["x", "y", "z", "rx", "ry", "rz"];
  const fullKey = (k) => Object.fromEntries(CAM_FIELDS.map((f) => [f, k[f] ?? 0]));
  function camAt(keys, t) {
    if (t <= keys[0].at) return fullKey(keys[0]);
    const last = keys[keys.length - 1];
    if (t >= last.at) return fullKey(last);
    let i = 0;
    while (keys[i + 1].at < t) i += 1;
    const p0 = keys[Math.max(0, i - 1)];
    const p1 = keys[i];
    const p2 = keys[i + 1];
    const p3 = keys[Math.min(keys.length - 1, i + 2)];
    const u = (t - p1.at) / (p2.at - p1.at);
    const out = {};
    for (const f of CAM_FIELDS) {
      const a = p0[f] ?? 0;
      const b = p1[f] ?? 0;
      const c = p2[f] ?? 0;
      const d = p3[f] ?? 0;
      out[f] = 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    }
    return out;
  }
  const camCss = (c) =>
    `translate3d(${c.x.toFixed(2)}px,${c.y.toFixed(2)}px,${c.z.toFixed(2)}px) rotateX(${c.rx.toFixed(3)}deg) rotateY(${c.ry.toFixed(3)}deg) rotateZ(${c.rz.toFixed(3)}deg)`;

  // ------------------------------------------------------------------- dom
  function h(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  }
  const q = (root, sel) => root.querySelector(sel);
  const qa = (root, sel) => Array.from(root.querySelectorAll(sel));

  /** Places an object around its own centre. */
  function place(el, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1 } = {}) {
    el.style.transformOrigin = "0 0";
    el.style.transform = `translate3d(${x}px,${y}px,${z}px) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${s}) translate(-50%,-50%)`;
  }
  const setBlur = (el, px) => {
    el.style.filter = px > 0.05 ? `blur(${px.toFixed(2)}px)` : "none";
  };
  const show = (el, o) => {
    el.style.opacity = clamp(o).toFixed(3);
    el.style.visibility = o <= 0.001 ? "hidden" : "visible";
  };

  const ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    logIn: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    snow: '<path d="M2 12h20M12 2v20M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  };
  const icon = (name, size = 20, width = 2) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

  /** The demo entry pass, generated once from qrcode.react with the landing's sample value. */
  const QR_PATH = window.RIVET_FILM_QR;

  const stage = document.getElementById("stage");
  stage.style.width = `${W}px`;
  stage.style.height = `${H}px`;
  document.body.dataset.format = FORMAT;

  // --------------------------------------------------------------- ambient
  const ambient = h('<div id="ambient" class="layer"></div>');
  stage.append(ambient);

  const BOKEH = (() => {
    const rand = mulberry32(7);
    return Array.from({ length: 16 }, (_, i) => {
      const warm = i % 7 === 3;
      const size = 60 + rand() * 260;
      return {
        x: rand() * W,
        y: rand() * H,
        size,
        ax: 40 + rand() * 120,
        ay: 30 + rand() * 90,
        fx: 1 + Math.floor(rand() * 2),
        fy: 1 + Math.floor(rand() * 2),
        ph: rand() * Math.PI * 2,
        el: h(`<div class="bokeh" style="width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;filter:blur(${18 + rand() * 40}px);background:${warm ? "rgb(226 51 47 / 0.10)" : `rgb(242 240 230 / ${(0.02 + rand() * 0.035).toFixed(3)})`}"></div>`),
      };
    });
  })();
  for (const b of BOKEH) ambient.append(b.el);

  const sceneLayer = h('<div class="layer"></div>');
  stage.append(sceneLayer);
  const vignette = h('<div id="vignette" class="layer"></div>');
  // Grain is laid over the video by the page, not rendered into it: per-frame
  // noise nearly doubles the encoded size.
  stage.append(vignette);

  // ---------------------------------------------------------------- scenes
  const scenes = [];
  function scene(def) {
    const root = h('<div class="scene"><div class="world"></div></div>');
    if (def.perspective) root.style.perspective = `${def.perspective}px`;
    sceneLayer.append(root);
    const world = q(root, ".world");
    const refs = def.build(world);
    scenes.push({ ...def, root, world, refs });
  }

  function localTime(sc, t) {
    for (const offset of [0, -T, T]) {
      const tt = t + offset;
      if (tt >= sc.start && tt <= sc.end) return tt - sc.start;
    }
    return null;
  }

  // ======================================================== 1 · entry (QR + desk)
  const ARRIVALS = [
    ["07:09", "Ghassan Shami", "SWF-1137"],
    ["07:06", "Nasser Najjar", "SWF-1045"],
    ["07:02", "Lina Qasem", "SWF-1052"],
    ["06:58", "Rami Qudah", "SWF-1139"],
    ["06:51", "Sara Abuhamdan", "SWF-1101"],
  ];
  const MATCHES = [
    ["HM", "Haya Malkawi", "SWF-1124", "+962 77 799 9627", "10-Visit Pass"],
    ["HQ", "Haya Qaralleh", "SWF-1078", "+962 77 430 3204", "Annual All-Access"],
    ["HS", "Haya Saleh", "SWF-1088", "+962 79 895 3739", "Annual All-Access"],
    ["HS", "Haya Sayegh", "SWF-1132", "+962 77 481 5275", "Monthly Standard"],
  ];

  scene({
    id: "entry",
    start: -0.6,
    end: 7.4,
    build(world) {
      const desk = h(`
        <div class="obj panel rx">
          <div class="rx-shift"><span class="dot"></span><b>Shift open · Hala Qasem</b><span>Since 05:30 · opening balance JOD 50.000</span><span>Cash received: JOD 145.000</span><span>Expected in the drawer: JOD 195.000</span><span class="end"><span>Shift history</span><span class="rx-btn">Close shift</span></span></div>
          <div class="rx-body">
            <div class="rx-main">
              <div class="rx-crumb">Front desk · Forge — Sweifieh</div>
              <div class="rx-title">Check in</div>
              <div class="rx-ready">${icon("scan", 18)} Scanner ready</div>
              <div class="rx-search">${icon("search", 24)}<span class="typed"></span><span class="rx-caret"></span><span class="ph">Scan a code, or search by name, phone or member number</span><span class="esc"><span class="kbd">Esc</span>clear</span></div>
              <div class="rx-stack">
                <div class="rx-ok" data-ok="0"><span class="tick">${icon("check", 26, 3)}</span><div><div class="who">Aya Al-Khatib checked in</div><div class="sub">SWF-1081 · Quarterly · ends 12 Jan 2027</div></div><div class="side">Entry QR<b>07:12</b></div></div>
                <div class="rx-ok" data-ok="1"><span class="tick">${icon("check", 26, 3)}</span><div><div class="who">Haya Malkawi checked in</div><div class="sub">SWF-1124 · 10-Visit Pass · 6 visits left</div></div><div class="side">Front desk<b>07:13</b></div></div>
                <div class="rx-results">
                  <div class="head"><b>4 members match “Haya”. Choose the right person to continue.</b><span>Scan their code or enter their member number to skip this list.</span></div>
                  ${MATCHES.map(([ini, name, id, phone, plan]) => `<div class="rx-row"><span class="bar"></span><span class="avatar">${ini}</span><div><div class="nm">${name}</div><div class="id mono">${id} · ${phone}</div></div><div class="plan">${plan}<span>Forge — Sweifieh</span></div></div>`).join("")}
                </div>
              </div>
              <div class="rx-hints"><span><span class="kbd">↵</span>Check in</span><span><span class="kbd">Esc</span>Next member</span><span><span class="kbd">⌘</span><span class="kbd">K</span>Search</span></div>
            </div>
            <div class="rx-rail">
              <div class="lbl">Check-ins today</div>
              <div class="rx-count"><div class="roll"><span data-n="46">46</span><span data-n="47">47</span><span data-n="48">48</span></div><small>visits</small></div>
              <div class="rx-meta"><span>Branch</span><span>Busiest hour</span><b>Forge — Sweifieh</b><b>06:00</b></div>
              <div class="rx-today"><div class="lbl">Who checked in today</div>
                <div class="rx-list">
                  <div class="rx-item" data-new="1"><span class="tm">07:13</span><div><div class="nm">Haya Malkawi</div><div class="id mono">SWF-1124</div></div><span class="dot"></span></div>
                  <div class="rx-item" data-new="0"><span class="tm">07:12</span><div><div class="nm">Aya Al-Khatib</div><div class="id mono">SWF-1081</div></div><span class="dot"></span></div>
                  ${ARRIVALS.map(([tm, name, id]) => `<div class="rx-item" data-old><span class="tm">${tm}</span><div><div class="nm">${name}</div><div class="id mono">${id}</div></div><span class="dot"></span></div>`).join("")}
                </div>
              </div>
            </div>
          </div>
          <div class="sheen"></div>
        </div>`);
      place(desk, fmt({ x: -250, y: 10, z: -260, ry: 22, rx: 2 }, { x: 0, y: 330, z: -420, ry: 16, rx: 4, s: 0.95 }));

      const phone = h(`
        <div class="obj phone">
          <div class="screen">
            <div class="island"></div>
            <div class="status"><span>7:12</span><span>5G</span></div>
            <div class="m-home"><div class="bar">RIVET</div><h3>Good morning, Aya</h3><div class="card"></div><div class="card"></div></div>
            <div class="m-scrim"></div>
            <div class="m-dialog">
              <div class="hd"><b>Entry QR</b><span>Forge Fitness Club</span></div>
              <div class="bd">
                <div class="qrbox">
                  <svg viewBox="0 0 37 37" shape-rendering="crispEdges"><path fill="#ffffff" d="M0,0 h37v37H0z"/><path fill="#15140f" d="${QR_PATH}"/></svg>
                  <span class="qr-scan"></span>
                  <span class="qr-corner" style="left:-2px;top:-2px;border-left-width:4px;border-top-width:4px;border-top-left-radius:9px"></span>
                  <span class="qr-corner" style="right:-2px;top:-2px;border-right-width:4px;border-top-width:4px;border-top-right-radius:9px"></span>
                  <span class="qr-corner" style="left:-2px;bottom:-2px;border-left-width:4px;border-bottom-width:4px;border-bottom-left-radius:9px"></span>
                  <span class="qr-corner" style="right:-2px;bottom:-2px;border-right-width:4px;border-bottom-width:4px;border-bottom-right-radius:9px"></span>
                </div>
                <div class="code mono">SWF-1081</div>
                <div class="exp">This code refreshes at 7:14 AM</div>
                <div class="fresh">Show a fresh pass</div>
              </div>
            </div>
          </div>
        </div>`);
      place(phone, fmt({ x: 560, y: 20, z: 160, ry: -20, rz: 2 }, { x: 120, y: -330, z: 140, ry: -14, rz: 2 }));
      const rings = [0, 1].map(() => {
        const r = h('<span class="ring"></span>');
        q(phone, ".qrbox").append(r);
        return r;
      });
      world.append(desk, phone);
      return {
        desk,
        phone,
        rings,
        typed: q(desk, ".typed"),
        caret: q(desk, ".rx-caret"),
        ph: q(desk, ".ph"),
        ok: qa(desk, ".rx-ok"),
        results: q(desk, ".rx-results"),
        resultsHead: q(desk, ".rx-results .head"),
        rows: qa(desk, ".rx-row"),
        rolls: qa(desk, ".roll span"),
        items: qa(desk, ".rx-item"),
        scan: q(phone, ".qr-scan"),
        corners: qa(phone, ".qr-corner"),
        sheen: q(desk, ".sheen"),
      };
    },
    cam: fmt(
      [
        { at: 0, x: -380, y: -20, z: 130, ry: -7, rx: 1 },
        { at: 2.0, x: -330, y: -16, z: 110, ry: -5, rx: 1 },
        { at: 4.2, x: 150, y: -20, z: 330, ry: 3, rx: 1 },
        { at: 8, x: 250, y: -30, z: 260, ry: 5.5, rx: 1.5 },
      ],
      [
        { at: 0, x: -80, y: 380, z: 360, ry: -4, rx: -2 },
        { at: 2.0, x: -70, y: 330, z: 300, ry: -3, rx: -2 },
        { at: 4.2, x: 20, y: -260, z: 140, ry: 2, rx: 2 },
        { at: 8, x: 40, y: -330, z: 90, ry: 3, rx: 3 },
      ],
    ),
    update(t, r) {
      const phoneFocus = 1 - ease.inOut(seg(t, 2.1, 3.4));
      setBlur(r.phone, (1 - phoneFocus) * 7);
      setBlur(r.desk, phoneFocus * 6);

      // the member's pass is scanned at the door
      r.scan.style.top = `${tw(t, 0.9, 1.9, 8, 254, ease.sine).toFixed(1)}px`;
      show(r.scan, Math.min(seg(t, 0.8, 0.95), 1 - seg(t, 1.9, 2.05)));
      for (const c of r.corners) show(c, Math.min(seg(t, 1.95, 2.1), 1 - seg(t, 3.0, 3.4)));
      r.rings.forEach((ring, i) => {
        const k = seg(t, 2.0 + i * 0.22, 3.0 + i * 0.22);
        const size = lerp(120, 620, ease.out(k));
        ring.style.width = `${size}px`;
        ring.style.height = `${size}px`;
        ring.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
        show(ring, k > 0 && k < 1 ? (1 - k) * 0.9 : 0);
      });

      // the desk records it, then a second member is found by name
      const ok0 = Math.min(seg(t, 2.45, 2.75), 1 - seg(t, 3.95, 4.15));
      const ok1 = seg(t, 6.0, 6.3);
      [ok0, ok1].forEach((o, i) => {
        show(r.ok[i], o);
        r.ok[i].style.transform = `translateY(${((1 - ease.out(Math.min(1, o * 1.4))) * -18).toFixed(1)}px)`;
      });
      const word = "Haya";
      const letters = [4.3, 4.42, 4.54, 4.66].filter((at) => t >= at).length;
      const typed = t >= 6.0 ? "" : word.slice(0, letters);
      r.typed.textContent = typed;
      show(r.ph, typed === "" && (t < 4.15 || t >= 6.0) ? 1 : 0);
      const typing = t > 4.2 && t < 5.95;
      show(r.caret, typing || Math.floor(t * 2.2) % 2 === 0 ? 1 : 0);
      r.caret.style.marginLeft = typed ? "-12px" : "0px";
      const res = Math.min(seg(t, 4.78, 4.9), 1 - seg(t, 5.9, 6.05));
      show(r.results, res);
      show(r.resultsHead, seg(t, 4.78, 4.95));
      r.rows.forEach((row, i) => {
        const k = ease.out(seg(t, 4.85 + i * 0.06, 5.15 + i * 0.06));
        show(row, k);
        row.style.transform = `translateY(${((1 - k) * 12).toFixed(1)}px)`;
        const hot = i === 0 ? seg(t, 5.35, 5.45) : 0;
        q(row, ".bar").style.opacity = hot.toFixed(2);
        const flash = i === 0 ? Math.max(0, seg(t, 5.85, 5.92) - seg(t, 5.92, 6.05)) : 0;
        row.style.background = flash > 0 ? `rgb(63 174 116 / ${(0.25 * flash).toFixed(3)})` : hot ? `rgb(255 255 255 / ${(0.045 * hot).toFixed(3)})` : "transparent";
      });

      // the rail counts each arrival
      const steps = [2.7, 6.25];
      r.rolls.forEach((span, i) => {
        // span i shows while the counter sits at 46 + i
        const enter = i === 0 ? 1 : ease.inOut(seg(t, steps[i - 1], steps[i - 1] + 0.35));
        const leave = i === r.rolls.length - 1 ? 0 : ease.inOut(seg(t, steps[i], steps[i] + 0.35));
        span.style.transform = `translateY(${((1 - enter) * 66 - leave * 66).toFixed(1)}px)`;
        show(span, Math.min(enter, 1 - leave));
      });
      const e1 = ease.inOut(seg(t, 2.85, 3.25));
      const e2 = ease.inOut(seg(t, 6.4, 6.8));
      let old = 0;
      for (const item of r.items) {
        if (item.dataset.new === "1") {
          item.style.transform = "translateY(0px)";
          show(item, seg(t, 6.5, 6.85));
        } else if (item.dataset.new === "0") {
          item.style.transform = `translateY(${(e2 * 64).toFixed(1)}px)`;
          show(item, seg(t, 2.95, 3.3));
        } else {
          item.style.transform = `translateY(${((old + e1 + e2) * 64).toFixed(1)}px)`;
          show(item, 1);
          old += 1;
        }
      }
      r.sheen.style.transform = `translateX(${tw(t, 1.5, 7.5, -60, 60, ease.sine).toFixed(1)}%)`;
    },
  });

  // ============================================================== 2 · classes
  const DAYS = [["Sat", "10 Oct"], ["Sun", "11 Oct"], ["Mon", "12 Oct"], ["Tue", "13 Oct"], ["Wed", "14 Oct"], ["Thu", "15 Oct"], ["Fri", "16 Oct"]];
  const CLASSES = [
    [0, 10, 2, "Weekend Open Gym", "Omar Al-Khatib", 0.4],
    [0, 18, 1, "Spin 45", "Karim Awad", 0.6],
    [1, 7, 1, "Morning HIIT", "Omar Al-Khatib", 1, true],
    [1, 18, 1, "Ladies Strength", "Dina Saleh", 0.7],
    [2, 6, 1, "Spin 45", "Karim Awad", 0.8],
    [2, 12, 1, "Ladies Strength", "Dina Saleh", 0.5],
    [2, 19, 1.25, "Boxing Fundamentals", "Karim Awad", 0.55],
    [3, 7, 1, "Morning HIIT", "Omar Al-Khatib", 0.9],
    [3, 18.5, 1, "Ladies Strength", "Dina Saleh", 0.6],
    [4, 7, 1, "Spin 45", "Karim Awad", 0.7],
    [4, 10, 1, "Mobility & Stretch", "Sara Abuhamdan", 0.5],
    [4, 19, 1.25, "Boxing Fundamentals", "Karim Awad", 0.75],
    [5, 7, 1, "Morning HIIT", "Omar Al-Khatib", 0.85],
    [5, 20, 1, "Strength Club", "Omar Al-Khatib", 0.45],
    [6, 9, 1.25, "Friday Flow Yoga", "Sara Abuhamdan", 0.65],
    [6, 17, 2, "Open Gym", "Front desk", 0.3],
  ];
  const BOOKERS = ["LQ", "RQ", "AN", "SA", "NN", "GS", "TM", "MB", "DH", "YS", "CS", "NA"];

  scene({
    id: "classes",
    start: 6.8,
    end: 13.2,
    build(world) {
      const hourPx = 68.6;
      const colW = (2100 - 110) / 7;
      const grid = h(`
        <div class="obj tt">
          <div class="tt-head"><div></div>${DAYS.map(([d, n]) => `<div>${d}<span>${n}</span></div>`).join("")}</div>
          <div class="tt-body">
            ${Array.from({ length: 16 }, (_, i) => `<div class="tt-hour" style="top:${(i * hourPx).toFixed(1)}px">${((i + 5) % 12) + 1}:00 ${i + 6 < 12 ? "AM" : "PM"}</div>`).join("")}
            ${DAYS.map((_, i) => `<div class="tt-col" style="left:${(110 + i * colW).toFixed(1)}px;width:${colW.toFixed(1)}px"></div>`).join("")}
            <div class="tt-now" style="top:${((7.2 - 6) * hourPx).toFixed(1)}px"></div>
            ${CLASSES.map(([d, start, len, name, coach, fill, hot]) => `<div class="tt-block${hot ? " hot" : ""}" style="left:${(110 + d * colW + 8).toFixed(1)}px;width:${(colW - 16).toFixed(1)}px;top:${((start - 6) * hourPx + 4).toFixed(1)}px;height:${(len * hourPx - 8).toFixed(1)}px;--fill:${Math.round(fill * 100)}%"><b>${name}</b><span>${coach}</span><i></i></div>`).join("")}
          </div>
        </div>`);
      place(grid, fmt({ x: -120, y: 170, z: -380, rx: 58, rz: -11 }, { x: 0, y: 250, z: -520, rx: 60, rz: -16, s: 0.92 }));
      const card = h(`
        <div class="obj panel cls">
          <div class="when">Sun 11 Oct · 7:00 AM · 45 min</div>
          <h4>Morning HIIT</h4>
          <div class="coach">Coach Omar Al-Khatib · Forge — Abdoun</div>
          <div class="cap"><div><div class="lbl">Booked</div><div class="n"><span class="booked-n">7</span> <small>/ 12</small></div></div><div style="display:flex;gap:8px"><span class="chip warn full">Full</span><span class="chip plain wait">3 waiting</span></div></div>
          <div class="meter"><i></i></div>
          <div class="faces">${BOOKERS.map((b) => `<span class="avatar">${b}</span>`).join("")}</div>
          <div class="booked"><div>Lina Qasem<span>Booked in the app</span></div><div>Rami Qudah<span>Booked at the desk</span></div><div>Aya Naber<span>Booked in the app</span></div></div>
          <div class="sheen"></div>
        </div>`);
      const near = h('<div class="obj tt-block" style="width:420px;height:150px;opacity:.55"><b>Spin 45</b><span>Karim Awad</span><i></i></div>');
      place(near, fmt({ x: -330, y: 210, z: 820, rx: 20, rz: -8, s: 0.8 }, { x: -260, y: 700, z: 820, rx: 20, rz: -8 }));
      setBlur(near, 16);
      world.append(grid, card, near);
      return {
        grid,
        card,
        blocks: qa(grid, ".tt-block"),
        n: q(card, ".booked-n"),
        meter: q(card, ".meter i"),
        faces: qa(card, ".faces .avatar"),
        full: q(card, ".full"),
        wait: q(card, ".wait"),
        rows: qa(card, ".booked div"),
        now: q(grid, ".tt-now"),
        sheen: q(card, ".sheen"),
      };
    },
    cam: fmt(
      [
        { at: 0, x: 170, y: -30, z: 210, rz: 1.5 },
        { at: 6.4, x: -170, y: -60, z: 330, rz: -1 },
      ],
      [
        { at: 0, x: 80, y: 60, z: 60, rz: 2 },
        { at: 6.4, x: -60, y: -40, z: 200, rz: -1 },
      ],
    ),
    update(t, r) {
      r.blocks.forEach((b, i) => {
        const k = ease.out(seg(t, 0.3 + i * 0.07, 0.75 + i * 0.07));
        b.style.transform = `scaleY(${k.toFixed(3)})`;
        show(b, k);
      });
      setBlur(r.grid, 1.2);
      show(r.now, seg(t, 1.2, 1.6));

      // the class lifts out of the timetable and fills up
      const lift = ease.outQuint(seg(t, 0.7, 1.9));
      place(r.card, fmt(
        { x: 250, y: lerp(60, -40, lift), z: lerp(-80, 280, lift), rx: lerp(62, 0, lift), ry: -13, rz: lerp(-8, 0, lift) },
        { x: 0, y: lerp(-80, -300, lift), z: lerp(-80, 260, lift), rx: lerp(62, 0, lift), ry: -8, rz: lerp(-8, 0, lift), s: 0.95 },
      ));
      show(r.card, seg(t, 0.7, 1.2));
      const booked = 7 + Math.floor(clamp(tw(t, 1.7, 3.4, 0, 5.999, ease.sine), 0, 5));
      r.n.textContent = String(booked);
      r.meter.style.width = `${((tw(t, 1.7, 3.4, 7, 12, ease.sine) / 12) * 100).toFixed(2)}%`;
      r.faces.forEach((f, i) => {
        const k = i < 7 ? 1 : seg(t, 1.7 + (i - 7) * 0.34, 1.9 + (i - 7) * 0.34);
        show(f, k);
        f.style.transform = `scale(${lerp(0.6, 1, ease.outBack(k)).toFixed(3)})`;
      });
      show(r.full, seg(t, 3.45, 3.65));
      r.full.style.transform = `scale(${lerp(0.8, 1, ease.outBack(seg(t, 3.45, 3.7))).toFixed(3)})`;
      show(r.wait, seg(t, 3.85, 4.05));
      r.rows.forEach((row, i) => show(row, seg(t, 1.3 + i * 0.12, 1.6 + i * 0.12)));
      r.sheen.style.transform = `translateX(${tw(t, 1, 6.4, -60, 60, ease.sine).toFixed(1)}%)`;
    },
  });

  // ============================================================= 3 · payments
  const PAYMENTS = [
    ["R-2479", "9 Oct, 23:31", "Nasser Najjar", "Card", "40.000", "Tarek Azar", "Abdoun"],
    ["R-2478", "9 Oct, 23:06", "Tala Malkawi", "Cash", "42.750", "Rana Issa", "Sweifieh"],
    ["R-2477", "9 Oct, 22:21", "Husam Lozi", "Cash", "350.000", "Hala Qasem", "Abdoun"],
    ["R-2476", "9 Oct, 20:56", "Yara Sweidan", "Card", "105.000", "Sara Abuhamdan", "Abdoun"],
    ["R-2341", "9 Oct, 10:00", "Lina Qasem", "Cash", "190.000", "Sara Abuhamdan", "Abdoun"],
    ["R-2417", "9 Oct, 10:00", "Diala Huneidi", "CliQ", "30.000", "Karim Awad", "Abdoun"],
    ["R-2332", "9 Oct, 10:00", "Carmen Shami", "Cash", "50.000", "Rana Issa", "Sweifieh"],
    ["R-2457", "8 Oct, 10:00", "Mira Barakat", "Cash", "190.000", "Rana Issa", "Sweifieh"],
    ["R-2456", "8 Oct, 10:00", "Nour Armoush", "Card", "350.000", "Karim Awad", "Sweifieh"],
    ["R-2458", "8 Oct, 10:00", "Sandra Armoush", "Cash", "40.000", "Karim Awad", "Sweifieh"],
    ["R-2455", "8 Oct, 09:40", "Omar Haddad", "CliQ", "105.000", "Hala Qasem", "Abdoun"],
    ["R-2452", "8 Oct, 09:12", "Dana Khoury", "Card", "190.000", "Tarek Azar", "Abdoun"],
    ["R-2449", "7 Oct, 21:03", "Zaid Hamdan", "Cash", "42.750", "Rana Issa", "Sweifieh"],
    ["R-2446", "7 Oct, 19:47", "Rakan Odeh", "CliQ", "350.000", "Karim Awad", "Abdoun"],
  ];

  scene({
    id: "payments",
    start: 12.6,
    end: 19.0,
    build(world) {
      const table = h(`
        <div class="obj panel ptable">
          <div class="tr th"><span>Receipt</span><span>When</span><span>Member</span><span>Type</span><span>Method</span><span class="amt">Amount</span><span>Status</span><span>Staff</span><span>Branch</span></div>
          <div class="rows">${PAYMENTS.map(([no, when, who, method, amt, staff, br]) => `<div class="tr"><span class="mono">${no}</span><span class="ink2">${when}</span><span>${who}</span><span class="ink2">Payment</span><span>${method}</span><span class="amt">JOD ${amt}</span><span><span class="chip ok">Completed</span></span><span class="ink2">${staff}</span><span class="ink2">${br}</span></div>`).join("")}</div>
        </div>`);
      place(table, fmt({ x: -60, y: 30, z: -900, ry: 16, rx: 4 }, { x: 0, y: 0, z: -1000, ry: 12, rx: 4 }));
      const pay = h(`
        <div class="obj panel pay">
          <div class="hd"><b>Collect payment</b><span>Forge — Sweifieh · Shift 2 · Rana Issa</span></div>
          <div class="bd">
            <div class="member"><span class="avatar">TM</span><div><b>Tala Malkawi</b><span class="mono">SWF-1054</span></div><span class="chip plain">Quarterly · renewal</span></div>
            <div class="lbl">Amount</div>
            <div class="amount"><small>JOD</small><span class="amt">0.000</span></div>
            <div class="lbl">Method</div>
            <div class="seg"><i class="knob"></i><span>Cash</span><span>Card</span><span>CliQ</span></div>
            <div class="ref mono">CliQ alias FORGEGYM · reference 8F2K41</div>
            <div class="go"><span>Collect JOD 105.000</span><div class="done">${icon("check", 22, 3)} Payment recorded</div></div>
          </div>
          <div class="sheen"></div>
        </div>`);
      place(pay, fmt({ x: -330, y: 0, z: 0, ry: 16, rx: 2 }, { x: -110, y: -230, z: 0, ry: 8, rx: 3 }));
      const receipt = h(`
        <div class="obj receipt">
          <div class="gym">Forge Fitness Club</div>
          <div class="br">Forge — Sweifieh</div>
          <div class="no">Receipt<b>R-2480</b></div>
          <div class="no" style="margin-top:6px">10 Oct 2026<b style="font-family:var(--sans)">6:14 PM</b></div>
          <hr />
          <div class="ln"><span>Member</span>Tala Malkawi</div>
          <div class="ln"><span>Membership</span>Quarterly</div>
          <div class="ln"><span>Paid by</span>CliQ</div>
          <hr />
          <div class="tot"><span>Total</span>JOD 105.000</div>
          <div class="bal"><span>Still owed</span>JOD 0.000</div>
          <div class="by">Received by Rana Issa · shift 2</div>
          <div class="teeth"></div>
        </div>`);
      const near = h('<div class="obj chip ok" style="height:64px;padding:0 26px;font-size:30px;border-radius:12px;opacity:.55">Completed</div>');
      place(near, fmt({ x: 170, y: -150, z: 900, rz: -6, s: 0.8 }, { x: 330, y: -820, z: 900, rz: -6 }));
      setBlur(near, 14);
      world.append(table, pay, receipt, near);
      return {
        table,
        rows: q(table, ".rows"),
        pay,
        receipt,
        amt: q(pay, ".amt"),
        knob: q(pay, ".knob"),
        segs: qa(pay, ".seg span"),
        ref: q(pay, ".ref"),
        go: q(pay, ".go"),
        done: q(pay, ".done"),
        sheen: q(pay, ".sheen"),
      };
    },
    cam: fmt(
      [
        { at: 0, x: 260, y: 0, z: 330, ry: -2 },
        { at: 3, x: 90, y: -6, z: 290, ry: 0 },
        { at: 6.4, x: -140, y: -14, z: 360, ry: 2.5 },
      ],
      [
        { at: 0, x: 0, y: 240, z: 160, rx: -2 },
        { at: 3, x: 0, y: 120, z: 120 },
        { at: 6.4, x: 0, y: -260, z: 160, rx: 2 },
      ],
    ),
    update(t, r) {
      setBlur(r.table, 5);
      show(r.table, 0.6);
      r.rows.style.transform = `translateY(${(-t * 26).toFixed(1)}px)`;

      const v = tw(t, 0.5, 1.4, 0, 105, ease.outQuint);
      r.amt.textContent = v.toFixed(3);
      // Cash → Card → CliQ
      const pos = tw(t, 1.35, 1.65, 0, 1) + tw(t, 2.0, 2.3, 0, 1);
      r.knob.style.transform = `translateX(${(pos * 100).toFixed(2)}%)`;
      r.segs.forEach((s, i) => {
        const on = clamp(1 - Math.abs(pos - i) * 1.6);
        s.style.color = on > 0.5 ? "#15140f" : "var(--ink-2)";
      });
      show(r.ref, seg(t, 2.3, 2.55));
      const press = Math.max(0, seg(t, 2.85, 2.95) - seg(t, 2.95, 3.1));
      r.go.style.transform = `scale(${(1 - press * 0.03).toFixed(4)})`;
      const done = ease.out(seg(t, 3.0, 3.3));
      r.done.style.clipPath = `inset(0 ${((1 - done) * 100).toFixed(2)}% 0 0)`;

      // the receipt prints out beside it
      const print = ease.out(seg(t, 3.2, 4.3));
      place(r.receipt, fmt(
        { x: 340, y: lerp(120, 40, print), z: 140, ry: -15, rz: lerp(-1, 2.5, print), rx: 2 },
        { x: 40, y: lerp(470, 390, print), z: 160, ry: -8, rz: lerp(-1, 2.5, print), rx: 2, s: 0.95 },
      ));
      r.receipt.style.clipPath = `inset(0 0 ${((1 - print) * 100).toFixed(2)}% 0)`;
      show(r.receipt, seg(t, 3.2, 3.35));
      r.sheen.style.transform = `translateX(${tw(t, 0.5, 6.4, -60, 60, ease.sine).toFixed(1)}%)`;
    },
  });

  // ================================================================ 4 · sales
  const LANES = [
    ["Trial", "20", "JOD 3.7K", "New leads and trials in progress", [
      ["Tareq Tarawneh", "+962 79 646 6099", "DS", "JOD 350.000", "Not contacted yet", "Follow-up due today"],
      ["Aya Zureikat", "+962 79 972 2504", "DS", "JOD 190.000", "Trial booked · 18 days ago", "Follow-up overdue — yesterday"],
      ["Farah Malkawi", "+962 78 309 6893", "DS", "JOD 350.000", "Asked for a callback", "Follow-up overdue — yesterday"],
      ["Mohammad Majali", "+962 79 388 6331", "KA", "JOD 105.000", "Trial visit today", ""],
      ["Yazan Hourani", "+962 77 512 0864", "KA", "JOD 190.000", "Asked about classes", ""],
    ]],
    ["Membership sold", "3", "JOD 250.000", "Bought a membership", [
      ["Rita Qaralleh", "+962 79 377 9127", "DS", "JOD 105.000", "Sold · 4 days ago", ""],
      ["Haya Sayegh", "+962 77 481 5275", "DS", "JOD 105.000", "Sold · 21 days ago", ""],
      ["Emad Qaralleh", "+962 78 435 9581", "KA", "JOD 40.000", "Sold · 2 days ago", ""],
    ]],
    ["Membership not sold", "3", "JOD 645.000", "Did not buy", [
      ["Basil Al-Masri", "+962 77 374 3046", "DS", "JOD 105.000", "No answer · 5 days ago", ""],
      ["Mais Naber", "+962 78 380 4832", "DS", "JOD 350.000", "Interested · 19 days ago", ""],
      ["Salma Al-Masri", "+962 78 638 4318", "KA", "JOD 190.000", "Asked for a callback", ""],
    ]],
    ["Did not answer", "4", "JOD 770.000", "Called, no answer yet", [
      ["Mohammad Naber", "+962 77 150 9407", "DS", "JOD 350.000", "No answer · 19 days ago", ""],
      ["Baraa Zureikat", "+962 79 348 2854", "KA", "JOD 190.000", "No answer · 8 days ago", ""],
      ["Talal Kurdi", "+962 77 793 4618", "KA", "JOD 190.000", "No answer · 23 days ago", ""],
      ["Rami Qudah", "+962 79 194 9419", "DS", "JOD 40.000", "No answer · 3 days ago", ""],
    ]],
  ];
  const SLOT = 212;
  const LANE_STEP = 456;

  scene({
    id: "sales",
    start: 18.4,
    end: 24.6,
    build(world) {
      const board = h(`
        <div class="obj board">
          ${LANES.map(([name, count, sum, sub, cards], li) => `
            <div class="lane" style="position:relative;z-index:${li === 0 ? 2 : 1}">
              <div class="lh"><b>${name}</b><span class="cnt" data-lane="${li}">${count}</span><span class="sum" data-lane="${li}">${sum}</span></div>
              <div class="ls">${sub}</div>
              <div class="cards">
                ${cards.map(([nm, ph, ini, amt, st, fu], ci) => `
                  <div class="lead${li === 0 && ci === 0 ? " hero" : ""}" data-lane="${li}" data-slot="${ci}" style="top:${ci * SLOT}px">
                    <div class="top"><div><b>${nm}</b><span class="mono">${ph}</span></div><span class="avatar">${ini}</span></div>
                    <div class="mid"><span>${ini === "DS" ? "Dina Saleh" : "Karim Awad"}</span><b>${amt}</b></div>
                    <div class="st">${st}</div>
                    ${fu ? `<div class="fu">${fu}</div>` : ""}
                    <div class="acts"><span>${icon("phone", 14)} Call</span><span>No answer</span><span>Not sold…</span></div>
                    ${li === 0 && ci === 0 ? `<div class="sold"><div class="top"><div><b>${nm}</b><span class="mono">${ph}</span></div><span class="avatar">${ini}</span></div><div class="mid"><span>Dina Saleh</span><b>JOD 105.000</b></div><div class="st" style="color:var(--success)">Membership sold · Quarterly</div><div class="fu" style="color:var(--ink-2)">Sold by Dina Saleh · today</div><div class="acts"><span class="chip ok">${icon("check", 14, 3)} Sold</span><span>Receipt R-2480</span></div></div>` : ""}
                  </div>`).join("")}
              </div>
            </div>`).join("")}
        </div>`);
      board.style.position = "absolute";
      place(board, fmt({ x: -60, y: 50, z: -170, ry: -17, rx: 7 }, { x: 260, y: -40, z: -420, ry: -12, rx: 6, s: 0.9 }));
      const near = h('<div class="obj lead" style="width:430px;opacity:.5"><div class="top"><div><b>Lina Haddad</b><span class="mono">+962 79 220 4518</span></div><span class="avatar">KA</span></div><div class="mid"><span>Karim Awad</span><b>JOD 190.000</b></div><div class="st">Trial visit tomorrow</div></div>');
      place(near, fmt({ x: 60, y: -180, z: 900, ry: -10, rz: 6, s: 0.6 }, { x: 420, y: -760, z: 900, ry: -10, rz: 6 }));
      setBlur(near, 18);
      world.append(board, near);
      const hero = q(board, ".lead.hero");
      return {
        board,
        hero,
        heroFu: q(hero, ".fu"),
        heroSt: q(hero, ".st"),
        sold: q(hero, ".sold"),
        trial: qa(board, '.lead[data-lane="0"]:not(.hero)'),
        soldLane: qa(board, '.lead[data-lane="1"]'),
        cnt0: q(board, '.cnt[data-lane="0"]'),
        cnt1: q(board, '.cnt[data-lane="1"]'),
        sum1: q(board, '.sum[data-lane="1"]'),
      };
    },
    cam: fmt(
      [
        { at: 0, x: 470, y: 40, z: 300, ry: -2 },
        { at: 2, x: 400, y: 40, z: 320, ry: -1 },
        { at: 3.6, x: 60, y: 30, z: 350, ry: 1 },
        { at: 6.2, x: -80, y: 20, z: 380, ry: 2 },
      ],
      [
        { at: 0, x: 200, y: 0, z: 220 },
        { at: 2, x: 160, y: 0, z: 240 },
        { at: 3.6, x: -200, y: 10, z: 260 },
        { at: 6.2, x: -270, y: 10, z: 280 },
      ],
    ),
    update(t, r) {
      // the follow-up is done, the lead is sold and moves across
      const called = t >= 1.25;
      r.heroFu.textContent = called ? "Called · wants the quarterly plan" : "Follow-up due today";
      r.heroFu.style.color = called ? "var(--ink-2)" : "#f0605c";
      r.heroSt.textContent = called ? "Called today by Dina Saleh" : "Not contacted yet";
      const hot = seg(t, 0.6, 0.9);
      r.hero.classList.toggle("carry", hot > 0.5 && t < 3.6);
      const lift = Math.min(ease.out(seg(t, 1.8, 2.1)), 1 - ease.inOut(seg(t, 3.3, 3.55)));
      const travel = ease.inOut(seg(t, 2.1, 3.35));
      r.hero.style.transform = `translate(${(travel * LANE_STEP).toFixed(1)}px, ${(-lift * 14).toFixed(1)}px) rotate(${(-lift * 2.2).toFixed(2)}deg) scale(${(1 + lift * 0.05).toFixed(4)})`;
      r.hero.style.zIndex = "5";
      show(r.sold, seg(t, 3.4, 3.75));
      const down = ease.inOut(seg(t, 2.4, 3.05));
      r.soldLane.forEach((c) => {
        c.style.transform = `translateY(${(down * SLOT).toFixed(1)}px)`;
      });
      const up = ease.inOut(seg(t, 2.6, 3.25));
      r.trial.forEach((c) => {
        c.style.transform = `translateY(${(-up * SLOT).toFixed(1)}px)`;
      });
      r.cnt0.textContent = t >= 3.0 ? "19" : "20";
      r.cnt1.textContent = t >= 3.4 ? "4" : "3";
      r.sum1.textContent = t >= 3.4 ? "JOD 355.000" : "JOD 250.000";
      const flash = Math.max(0, seg(t, 3.4, 3.5) - seg(t, 3.6, 4.2));
      r.sum1.style.color = flash > 0 ? "var(--success)" : "var(--ink-2)";
      r.cnt1.style.color = flash > 0 ? "var(--success)" : "var(--ink-3)";
    },
  });

  // ============================================================ 5 · one member
  const EVENTS = [
    ["userPlus", "Walk-in enquiry", "Asked about quarterly prices at the desk", "Dina Saleh", "2 Jul 2026"],
    ["calendar", "Free trial visit", "Trial booked and attended", "Dina Saleh", "4 Jul 2026"],
    ["ticket", "Membership sold", "Quarterly · Forge — Sweifieh", "Dina Saleh", "6 Jul 2026"],
    ["receipt", "Payment received", "JOD 105.000 · CliQ · receipt R-2311", "Rana Issa", "6 Jul 2026"],
    ["logIn", "Checked in 38 times", "Last visit today at 7:12 AM", "Front desk", "Today"],
    ["snow", "Membership frozen for 7 days", "Travelling · reason recorded, end date moved", "Branch manager", "2 Sep 2026"],
    ["refresh", "Membership renewed", "Quarterly · ends 12 Jan 2027", "Rana Issa", "10 Oct 2026"],
  ];

  scene({
    id: "member",
    start: 24.0,
    end: 30.2,
    build(world) {
      const profile = h(`
        <div class="obj panel profile">
          <div class="who"><span class="avatar">AK</span><div><h4>Aya Al-Khatib</h4><p><span class="mono">SWF-1081</span> · +962 79 508 5803 · Forge — Sweifieh</p></div></div>
          <div class="tags"><span class="chip ok"><span class="dot"></span> Active</span><span class="chip plain">Quarterly · ends 12 Jan 2027</span><span class="chip plain">Still owed JOD 0.000</span></div>
          <div class="sec"><b>Member timeline</b><span>Recorded under the person who did it</span></div>
          <div class="tl"><div class="spine"><i></i></div>
            ${EVENTS.map(([ic, title, detail, by, when]) => `<div class="ev"><span class="node">${icon(ic, 20)}</span><div class="tx"><b>${title}</b><span>${detail}</span></div><div class="by">${by}<span>${when}</span></div></div>`).join("")}
          </div>
          <div class="sheen"></div>
        </div>`);
      place(profile, fmt({ x: 60, y: 0, z: -140, rx: 24, ry: -11, rz: 2 }, { x: 0, y: 0, z: -300, rx: 28, ry: -12, rz: 4, s: 0.95 }));
      world.append(profile);
      return {
        profile,
        evs: qa(profile, ".ev"),
        spine: q(profile, ".spine"),
        fill: q(profile, ".spine i"),
        sheen: q(profile, ".sheen"),
      };
    },
    cam: fmt(
      [
        { at: 0, x: 40, y: 480, z: 330, rz: -0.6 },
        { at: 6.2, x: -120, y: -420, z: 420, rz: 0.8 },
      ],
      [
        { at: 0, x: 0, y: 520, z: 140 },
        { at: 6.2, x: 0, y: -460, z: 210 },
      ],
    ),
    update(t, r) {
      const evH = 92;
      r.spine.style.height = `${(EVENTS.length - 1) * evH}px`;
      const reach = tw(t, 0.6, 0.6 + (EVENTS.length - 1) * 0.62, 0, EVENTS.length - 1, (k) => k);
      r.fill.style.transform = `scaleY(${(reach / (EVENTS.length - 1)).toFixed(4)})`;
      r.evs.forEach((ev, i) => {
        const at = 0.45 + i * 0.62;
        const k = ease.out(seg(t, at, at + 0.4));
        show(ev, 0.25 + k * 0.75);
        q(ev, ".tx").style.transform = `translateX(${((1 - k) * 22).toFixed(1)}px)`;
        ev.classList.toggle("on", reach >= i - 0.05);
      });
      r.sheen.style.transform = `translateX(${tw(t, 0, 6.2, -60, 60, ease.sine).toFixed(1)}%)`;
    },
  });

  // ======================================================= 6 · the owner's view
  const KPIS = [
    ["Collected today", 1284.5, (v) => `JOD ${v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`, "Cash, card and CliQ"],
    ["Collected this month", 31.4, (v) => `JOD ${v.toFixed(1)}K`, "↑ 12% on last month"],
    ["Unpaid", 592, (v) => `JOD ${v.toFixed(3)}`, "owed by members", "warn"],
    ["New members", 5, (v) => `${Math.round(v)}`, "joined this month"],
    ["Ending this week", 4, (v) => `${Math.round(v)}`, "memberships"],
    ["Check-ins today", 213, (v) => `${Math.round(v)}`, "both branches"],
  ];
  const BRANCHES = [
    { name: "Forge — Abdoun", note: "128 check-ins · JOD 742.500", x: 1790, y: 1120 },
    { name: "Forge — Sweifieh", note: "85 check-ins · JOD 542.000", x: 1180, y: 930 },
  ];

  function streets() {
    const rand = mulberry32(42);
    const paths = [];
    // arterial roads
    for (let i = 0; i < 9; i += 1) {
      let x = rand() * 3000;
      let y = rand() < 0.5 ? 0 : 2000;
      let a = Math.atan2(1000 - y, 1500 - x) + (rand() - 0.5) * 1.2;
      let d = `M${x.toFixed(0)} ${y.toFixed(0)}`;
      for (let s = 0; s < 18; s += 1) {
        a += (rand() - 0.5) * 0.35;
        x += Math.cos(a) * 150;
        y += Math.sin(a) * 150;
        d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
      }
      paths.push(`<path d="${d}" stroke="#6a6352" stroke-width="6" fill="none" stroke-linejoin="round"/>`);
    }
    // neighbourhood blocks
    for (let n = 0; n < 34; n += 1) {
      const cx = 200 + rand() * 2600;
      const cy = 150 + rand() * 1700;
      const rot = rand() * 180;
      const size = 120 + rand() * 180;
      const step = 34 + rand() * 18;
      let d = "";
      for (let k = -size; k <= size; k += step) d += `M${-size} ${k.toFixed(0)} H${size} M${k.toFixed(0)} ${-size} V${size} `;
      paths.push(`<path transform="translate(${cx.toFixed(0)} ${cy.toFixed(0)}) rotate(${rot.toFixed(0)})" d="${d}" stroke="#3d392f" stroke-width="2.5" fill="none"/>`);
    }
    return paths.join("");
  }

  scene({
    id: "owner",
    start: 29.6,
    end: 35.9,
    build(world) {
      const map = h(`
        <div class="obj map">
          <svg viewBox="0 0 3000 2000" width="3000" height="2000">
            <defs><radialGradient id="mapfade" cx="50%" cy="52%" r="55%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient><mask id="mapmask"><rect width="3000" height="2000" fill="url(#mapfade)"/></mask></defs>
            <g mask="url(#mapmask)">${streets()}
              <path d="M600 1000 C 700 400, 2300 350, 2450 1000 S 1200 1800, 600 1000" stroke="#5a5446" stroke-width="7" fill="none"/>
              <text x="1830" y="1260" fill="#6f6c5d" font-size="38" font-family="Manrope">Abdoun</text>
              <text x="1080" y="1060" fill="#6f6c5d" font-size="38" font-family="Manrope">Sweifieh</text>
              <text x="1600" y="760" fill="#57544a" font-size="34" font-family="Manrope">Jabal Amman</text>
              <text x="1300" y="560" fill="#57544a" font-size="34" font-family="Manrope">Shmeisani</text>
              <text x="700" y="760" fill="#57544a" font-size="34" font-family="Manrope">Khalda</text>
            </g>
          </svg>
          ${BRANCHES.map((b) => `<div class="pin" style="left:${b.x}px;top:${b.y}px"><span class="pulse"></span><span class="pulse"></span><span class="pulse"></span><span class="core"></span><span class="beam"></span><div class="tag">${b.name}<span>${b.note}</span></div></div>`).join("")}
        </div>`);
      place(map, fmt({ x: 0, y: 360, z: -520, rx: 66 }, { x: 0, y: 520, z: -700, rx: 66 }));
      const dash = h(`
        <div class="obj panel dash">
          <div class="greet">10 Oct 2026</div>
          <h4>Good evening, Omar</h4>
          <div class="sub">Both branches together.</div>
          <div class="kpis">${KPIS.map(([l, , , d, tone]) => `<div class="kpi"><div class="l">${l}</div><div class="v${tone ? ` ${tone}` : ""}">0</div><div class="d">${d}</div></div>`).join("")}</div>
          <div class="chart"><div class="l">Collected each day · last 30 days</div>
            <svg viewBox="0 0 1000 160" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(226 51 47 / 0.35)"/><stop offset="1" stop-color="rgb(226 51 47 / 0)"/></linearGradient></defs><path class="area" fill="url(#area)"/><path class="line" pathLength="1000" fill="none" stroke="#e2332f" stroke-width="3"/></svg>
          </div>
          <div class="sheen"></div>
        </div>`);
      place(dash, fmt({ x: 0, y: -150, z: 40, rx: -3 }, { x: 0, y: -380, z: 40, rx: -3, s: 0.66 }));
      world.append(map, dash);

      const rand = mulberry32(5);
      const pts = Array.from({ length: 30 }, (_, i) => {
        const base = 70 + 30 * Math.sin(i / 3.2) + i * 1.6 + (rand() - 0.5) * 34;
        return [(i / 29) * 1000, 160 - clamp(base, 10, 150)];
      });
      const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
      q(dash, ".line").setAttribute("d", line);
      q(dash, ".area").setAttribute("d", `${line} L1000 160 L0 160 Z`);
      const lineEl = q(dash, ".line");
      return {
        map,
        dash,
        vals: qa(dash, ".kpi .v"),
        line: lineEl,
        area: q(dash, ".area"),
        pins: qa(map, ".pin"),
        sheen: q(dash, ".sheen"),
      };
    },
    cam: fmt(
      [
        { at: 0, x: 0, y: 160, z: 420, rx: -3 },
        { at: 2.4, x: 10, y: 40, z: 200, rx: 3 },
        { at: 6.4, x: 60, y: -300, z: -60, rx: 16, rz: -2 },
      ],
      [
        { at: 0, x: 0, y: 330, z: 380, rx: -3 },
        { at: 2.4, x: 0, y: 200, z: 170, rx: 2 },
        { at: 6.4, x: 30, y: 0, z: -200, rx: 10, rz: -2 },
      ],
    ),
    update(t, r) {
      KPIS.forEach(([, target, format], i) => {
        const k = ease.outQuint(seg(t, 0.35 + i * 0.08, 1.7 + i * 0.08));
        r.vals[i].textContent = format(target * k);
      });
      r.line.style.strokeDasharray = "1000";
      r.line.style.strokeDashoffset = `${(1000 * (1 - ease.inOut(seg(t, 0.8, 2.6)))).toFixed(1)}`;
      show(r.area, seg(t, 1.8, 2.8));
      setBlur(r.map, tw(t, 1.5, 3.5, 4, 0));
      show(r.map, seg(t, 1.2, 2.6));
      r.pins.forEach((pin, i) => {
        const on = ease.out(seg(t, 2.6 + i * 0.25, 3.2 + i * 0.25));
        qa(pin, ".pulse").forEach((p, j) => {
          const k = ((t + j * 0.62 + i * 0.3) % 1.9) / 1.9;
          const size = lerp(30, 380, ease.out(k));
          p.style.width = `${size}px`;
          p.style.height = `${size}px`;
          p.style.left = `${-size / 2}px`;
          p.style.top = `${-size / 2}px`;
          show(p, on * (1 - k) * 0.85);
        });
        show(q(pin, ".core"), on);
        const beam = q(pin, ".beam");
        beam.style.transform = `rotateX(-90deg) scaleY(${on.toFixed(3)})`;
        show(beam, on * 0.85);
        const tag = q(pin, ".tag");
        tag.style.transform = `rotateX(-66deg) translateY(${((1 - on) * 20).toFixed(1)}px) scale(1.5)`;
        show(tag, seg(t, 3.1 + i * 0.25, 3.5 + i * 0.25));
      });
      r.sheen.style.transform = `translateX(${tw(t, 0, 6.3, -60, 60, ease.sine).toFixed(1)}%)`;
    },
  });

  // ---------------------------------------------------------------- render
  function seek(t) {
    const tt = ((t % T) + T) % T;
    for (const b of BOKEH) {
      const w = (2 * Math.PI) / T;
      const x = b.x + b.ax * Math.sin(w * b.fx * tt + b.ph);
      const y = b.y + b.ay * Math.cos(w * b.fy * tt + b.ph * 1.3);
      b.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }

    for (const sc of scenes) {
      const local = localTime(sc, tt);
      if (local === null) {
        sc.root.style.display = "none";
        continue;
      }
      sc.root.style.display = "block";
      const dur = sc.end - sc.start;
      const fadeIn = ease.out(seg(local, 0, 0.9));
      const fadeOut = 1 - ease.inOut(seg(local, dur - 0.85, dur));
      const env = Math.min(fadeIn, fadeOut);
      sc.root.style.opacity = env.toFixed(3);
      setBlur(sc.root, (1 - fadeIn) * 18 + (1 - fadeOut) * 14);
      const c = camAt(sc.cam, local);
      const push = (1 - fadeIn) * -60 + (1 - fadeOut) * 50;
      sc.world.style.transform = camCss({ ...c, z: c.z + push });
      sc.update(local, sc.refs);
    }
  }

  function play() {
    const t0 = performance.now();
    const loop = (now) => {
      seek((now - t0) / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  window.film = { duration: T, width: W, height: H, format: FORMAT, seek };
  seek(Number(params.get("t") ?? 0));
  if (params.has("play")) play();
})();
