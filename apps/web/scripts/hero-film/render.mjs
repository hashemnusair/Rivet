#!/usr/bin/env node
/**
 * Renders the RIVET hero film (film.html) to video, frame by frame.
 *
 *   node scripts/hero-film/render.mjs                      # both cuts into public/marketing/
 *   node scripts/hero-film/render.mjs --format portrait    # one cut
 *   node scripts/hero-film/render.mjs --stills 0,3.5,9 --out /tmp/stills   # review frames
 *
 * Needs ffmpeg on PATH and Playwright's Chromium (pnpm exec playwright install chromium).
 * Each frame is seeked deterministically, photographed at --scale (default 2)
 * and downsampled by ffmpeg, so text in the screens stays sharp.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "../../public/marketing");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const fps = Number(flag("fps", 30));
const scale = Number(flag("scale", 2));
const stills = flag("stills", null);
const formats = flag("format", null) ? [flag("format")] : ["landscape", "portrait"];
const out = resolve(flag("out", publicDir));
const crf = Number(flag("crf", 28));
/** The still behind the film until it plays, and for visitors who prefer reduced motion. */
const posterAt = Number(flag("poster", 3.2));
/** Renders only the first N seconds — for checking the pipeline, not for publishing. */
const seconds = flag("seconds", null);

/** Output sizes per cut: the stage is drawn at 1920×1080 / 1080×1920 CSS px. */
const CUTS = {
  landscape: { file: "rivet-film", width: 1920, height: 1080 },
  portrait: { file: "rivet-film-portrait", width: 1080, height: 1920 },
};

function ffmpeg(argv, { piped = false } = {}) {
  const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...(piped ? [] : ["-nostdin"]), ...argv], {
    stdio: [piped ? "pipe" : "ignore", "inherit", "inherit"],
  });
  const done = new Promise((ok, fail) => {
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}: ${argv.at(-1)}`))));
  });
  return { stdin: child.stdin, done };
}

async function openFilm(browser, format) {
  const cut = CUTS[format];
  const page = await browser.newPage({ viewport: { width: cut.width, height: cut.height }, deviceScaleFactor: scale });
  const url = pathToFileURL(join(here, "film.html"));
  url.search = `format=${format}`;
  await page.goto(url.href, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (!document.fonts.check('600 20px "Manrope"')) throw new Error("Manrope did not load");
  });
  return { page, cut, duration: await page.evaluate(() => window.film.duration) };
}

async function frameAt(page, t) {
  await page.evaluate((time) => window.film.seek(time), t);
  return page.screenshot({ type: "png", animations: "allow", caret: "initial" });
}

async function renderStills(browser, format) {
  mkdirSync(out, { recursive: true });
  const { page } = await openFilm(browser, format);
  for (const t of stills.split(",").map(Number)) {
    const png = await frameAt(page, t);
    const { stdin, done } = ffmpeg(["-f", "png_pipe", "-i", "-", "-vf", `scale=${CUTS[format].width / 2}:-2:flags=lanczos`, join(out, `${format}-${t.toFixed(2)}.jpg`)], { piped: true });
    stdin.end(png);
    await done;
  }
  await page.close();
}

async function renderFilm(browser, format) {
  mkdirSync(out, { recursive: true });
  const { page, cut, duration } = await openFilm(browser, format);
  const frames = Math.round((seconds ? Number(seconds) : duration) * fps);
  const scratch = mkdtempSync(join(tmpdir(), "rivet-film-"));
  const master = join(scratch, `${cut.file}.master.mov`);
  // Frames go into a lossless intermediate, then the web encode is made from it.
  const { stdin, done } = ffmpeg([
    "-f", "png_pipe", "-framerate", String(fps), "-i", "-",
    "-vf", `scale=${cut.width}:${cut.height}:flags=lanczos`,
    "-c:v", "libx264", "-preset", "veryfast", "-qp", "0", "-pix_fmt", "yuv444p", master,
  ], { piped: true });
  const started = Date.now();
  for (let i = 0; i < frames; i += 1) {
    const png = await frameAt(page, i / fps);
    if (!stdin.write(png)) await new Promise((ok) => stdin.once("drain", ok));
    if (i % fps === 0) process.stdout.write(`\r${format}: ${i}/${frames} frames · ${Math.round((Date.now() - started) / 1000)}s`);
  }
  stdin.end();
  await done;
  const poster = ffmpeg(["-f", "png_pipe", "-i", "-", "-vf", `scale=${cut.width}:${cut.height}:flags=lanczos`, "-q:v", "4", join(out, `${cut.file}-poster.jpg`)], { piped: true });
  poster.stdin.end(await frameAt(page, posterAt));
  await poster.done;
  await page.close();
  process.stdout.write(`\r${format}: ${frames}/${frames} frames · encoding\n`);

  const common = ["-i", master, "-an", "-r", String(fps)];
  await ffmpeg([...common, "-c:v", "libx264", "-preset", "veryslow", "-crf", String(crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-tune", "film", "-movflags", "+faststart", join(out, `${cut.file}.mp4`)]).done;
  rmSync(scratch, { recursive: true, force: true });
  console.log(`${format}: wrote ${cut.file}.mp4 and -poster.jpg to ${out}`);
}

const browser = await chromium.launch();
try {
  for (const format of formats) {
    if (stills) await renderStills(browser, format);
    else await renderFilm(browser, format);
  }
} finally {
  await browser.close();
}
