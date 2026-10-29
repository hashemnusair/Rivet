/**
 * Draws the member app's iPhone launch images (`public/launch/`) from the
 * screen list in `src/lib/pwa/launch-images.ts` and the mark geometry in
 * `src/components/motion/rivet-mark-geometry.ts`. Run after changing either:
 *
 *   node scripts/generate-launch-images.mjs
 *
 * sharp is not a dependency of its own; it comes with Next.
 */
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARK_VIEWBOX, stillMarkElements } from "../src/components/motion/rivet-mark-geometry.ts";
import { LAUNCH_INK, LAUNCH_MARK_HEIGHT, LAUNCH_PAPER, LAUNCH_SCREENS, LAUNCH_SIGNAL, launchImagePath, launchMarkCentre } from "../src/lib/pwa/launch-images.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next/package.json"))] }));

const mark = stillMarkElements({ ink: LAUNCH_INK, signal: LAUNCH_SIGNAL });
await mkdir(join(root, "public/launch"), { recursive: true });

for (const screen of LAUNCH_SCREENS) {
  const width = screen.width * screen.pixelRatio;
  const height = screen.height * screen.pixelRatio;
  const scale = (LAUNCH_MARK_HEIGHT * screen.pixelRatio) / MARK_VIEWBOX.height;
  const centre = launchMarkCentre(screen);
  const left = centre.x * screen.pixelRatio - (MARK_VIEWBOX.width / 2) * scale;
  const top = centre.y * screen.pixelRatio - (MARK_VIEWBOX.height / 2) * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" fill="${LAUNCH_PAPER}"/>`
    + `<g transform="translate(${left} ${top}) scale(${scale}) translate(${-MARK_VIEWBOX.x} ${-MARK_VIEWBOX.y})">${mark}</g>`
    + "</svg>";
  const file = join(root, "public", launchImagePath(screen));
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(file);
  console.log(`${launchImagePath(screen)}  ${width}×${height}  ${screen.devices}`);
}
