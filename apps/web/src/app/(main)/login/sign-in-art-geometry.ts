/*
 * Points along the sign-in drawings' strokes, worked out from the path data
 * itself. The browser's own measuring (`getPointAtLength`) walks the whole path
 * on every call and took a frame-dropping 30–140 ms per drawing on the main
 * thread; the drawings only use absolute M, L, H, V, C, S, Q, A and Z, so they
 * are flattened here into short straight runs and sampled along their length.
 */

export type Point = readonly [number, number];

const COMMAND = /[MLHVCSQAZ]/i;
const TOKEN = /[MLHVCSQAZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
/** Straight runs per curve, and the largest angle one run of an arc may turn. */
const CURVE_STEPS = 16;
const ARC_STEP = Math.PI / 24;

function cubic(out: Point[], p0: Point, p1: Point, p2: Point, p3: Point) {
  for (let i = 1; i <= CURVE_STEPS; i += 1) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
}

function quadratic(out: Point[], p0: Point, p1: Point, p2: Point) {
  for (let i = 1; i <= CURVE_STEPS; i += 1) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
}

const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

/** An elliptical arc from its end points to its centre (SVG 1.1, F.6.5), then in short runs. */
function arc(out: Point[], from: Point, rxIn: number, ryIn: number, rotation: number, large: boolean, sweep: boolean, to: Point) {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (from[0] === to[0] && from[1] === to[1])) {
    out.push(to);
    return;
  }
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const scale = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (scale > 1) {
    rx *= Math.sqrt(scale);
    ry *= Math.sqrt(scale);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let turn = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && turn > 0) turn -= 2 * Math.PI;
  else if (sweep && turn < 0) turn += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(Math.abs(turn) / ARC_STEP));
  for (let i = 1; i < steps; i += 1) {
    const t = start + (turn * i) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push([cx + cos * ex - sin * ey, cy + sin * ex + cos * ey]);
  }
  out.push(to);
}

/** A path as one run of points. The drawings draw each stroke as a single subpath. */
export function flatten(d: string): Point[] {
  const tokens = d.match(TOKEN) ?? [];
  const out: Point[] = [];
  let i = 0;
  let command = "";
  let current: Point = [0, 0];
  let start: Point = [0, 0];
  let control: Point | null = null;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (COMMAND.test(tokens[i]!)) command = tokens[i++]!.toUpperCase();
    let next: Point;
    switch (command) {
      case "M":
        next = [num(), num()];
        start = next;
        out.push(next);
        command = "L";
        control = null;
        break;
      case "L":
        next = [num(), num()];
        out.push(next);
        control = null;
        break;
      case "H":
        next = [num(), current[1]];
        out.push(next);
        control = null;
        break;
      case "V":
        next = [current[0], num()];
        out.push(next);
        control = null;
        break;
      case "C": {
        const c1: Point = [num(), num()];
        const c2: Point = [num(), num()];
        next = [num(), num()];
        cubic(out, current, c1, c2, next);
        control = c2;
        break;
      }
      case "S": {
        const c1: Point = control ? [2 * current[0] - control[0], 2 * current[1] - control[1]] : current;
        const c2: Point = [num(), num()];
        next = [num(), num()];
        cubic(out, current, c1, c2, next);
        control = c2;
        break;
      }
      case "Q": {
        const c: Point = [num(), num()];
        next = [num(), num()];
        quadratic(out, current, c, next);
        control = null;
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        const rotation = num();
        const large = num() !== 0;
        const sweep = num() !== 0;
        next = [num(), num()];
        arc(out, current, rx, ry, rotation, large, sweep, next);
        control = null;
        break;
      }
      case "Z":
        next = start;
        if (current[0] !== start[0] || current[1] !== start[1]) out.push(start);
        control = null;
        break;
      default:
        return out;
    }
    current = next;
  }
  return out;
}

/**
 * `count` points evenly spaced along a path, as `getPointAtLength` would give
 * them: a closed path is sampled all the way round without repeating its
 * start, an open one from end to end.
 */
export function samplePath(d: string, count: number, closed: boolean): Point[] {
  const run = flatten(d);
  const first = run[0] ?? [0, 0];
  if (run.length < 2) return Array.from({ length: count }, () => first);
  const lengths = [0];
  for (let i = 1; i < run.length; i += 1) lengths.push(lengths[i - 1]! + Math.hypot(run[i]![0] - run[i - 1]![0], run[i]![1] - run[i - 1]![1]));
  const total = lengths[lengths.length - 1]!;
  const points: Point[] = [];
  let segment = 1;
  for (let i = 0; i < count; i += 1) {
    const at = total * (closed ? i / count : i / (count - 1));
    while (segment < run.length - 1 && lengths[segment]! < at) segment += 1;
    const a = run[segment - 1]!;
    const b = run[segment]!;
    const span = lengths[segment]! - lengths[segment - 1]!;
    const k = span > 0 ? Math.min(1, Math.max(0, (at - lengths[segment - 1]!) / span)) : 0;
    points.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
  }
  return points;
}
