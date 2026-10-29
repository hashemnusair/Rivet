/*
 * The RIVET glyph as the weight stack it is, in its own units. Geometry is the
 * landing's loop machine (traced from `rivet-glyph-source.png`): one pitch for
 * all eight plates, the pin in the fifth. `RivetMarkLoader` animates it; the
 * member app's launch images (`scripts/generate-launch-images.mjs`) draw it
 * still, so the two match exactly. No imports: Node reads this file directly.
 */

export const MARK_VIEWBOX = { x: 44, y: 20, width: 102, height: 152 } as const;

export const MARK_POST = { x: 50, y: 26, width: 8, height: 142, rx: 2.5 } as const;
export const MARK_BAR = { x: 50, y: 26, width: 54, height: 8, rx: 2.5 } as const;
export const MARK_HOOK = { x: 96, y: 26, width: 8, height: 30.5, rx: 2.5 } as const;

export const PLATES = [
  { y: 67, w: 34 },
  { y: 80, w: 34 },
  { y: 93, w: 34 },
  { y: 106, w: 34 },
  { y: 119, w: 53.5 },
  { y: 132, w: 53.5 },
  { y: 145, w: 53.5 },
  { y: 158, w: 53.5 },
] as const;
export const PLATE_X = 73.5;
export const PLATE_HEIGHT = 10;
export const PLATE_RX = 2;
export const PIN_PLATE = 4;
export const PIN_Y = PLATES[PIN_PLATE].y + 5;
export const PIN_X = PLATE_X + PLATES[PIN_PLATE].w;
export const PIN_BAR = { x: PIN_X - 2.5, y: PIN_Y - 2.2, width: 9.5, height: 4.4, rx: 2.2 } as const;
export const PIN_RING = { cx: PIN_X + 10, cy: PIN_Y, r: 4, strokeWidth: 3.4 } as const;

/** The finished mark at rest, as SVG elements in mark units. */
export function stillMarkElements(colors: { ink: string; signal: string }): string {
  const rect = (r: { x: number; y: number; width: number; height: number; rx: number }, fill: string) =>
    `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}" fill="${fill}"/>`;
  return [
    rect(MARK_POST, colors.ink),
    rect(MARK_BAR, colors.ink),
    rect(MARK_HOOK, colors.ink),
    ...PLATES.map((plate) => rect({ x: PLATE_X, y: plate.y, width: plate.w, height: PLATE_HEIGHT, rx: PLATE_RX }, colors.ink)),
    rect(PIN_BAR, colors.signal),
    `<circle cx="${PIN_RING.cx}" cy="${PIN_RING.cy}" r="${PIN_RING.r}" fill="none" stroke="${colors.signal}" stroke-width="${PIN_RING.strokeWidth}"/>`,
  ].join("");
}
