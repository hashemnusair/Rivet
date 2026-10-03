/**
 * The landing's section settle: once a scroll has come to rest, a section
 * edge that stopped close to where it belongs is eased the last few pixels
 * into place. It replaces CSS `scroll-snap-type: y proximity`, whose reach
 * and quick, browser-chosen motion made the pull obvious and which re-snapped
 * whenever a section changed height.
 *
 * Unlike CSS snapping it only ever finishes a scroll: it reaches further in
 * the direction the visitor was already moving than against it, ignores
 * anything that would need a long move, and never runs while a finger,
 * wheel or key is still driving the page.
 */

export type SettleEdge =
  /** A section top, which belongs just under the fixed bar. */
  | { kind: "start"; top: number }
  /** The page's last block, whose bottom belongs on the viewport's bottom. */
  | { kind: "end"; bottom: number };

export interface SettleInput {
  scrollY: number;
  viewportHeight: number;
  /** Height of the fixed bar the section tops rest under. */
  barHeight: number;
  maxScroll: number;
  /** Edges in viewport coordinates, as getBoundingClientRect reports them. */
  edges: readonly SettleEdge[];
  /** Sign of the last scroll movement: 1 down the page, -1 up, 0 unknown. */
  direction: -1 | 0 | 1;
}

/** How far the settle may move the page with the visitor and against them. */
export const settleReach = (viewportHeight: number) => ({
  forward: Math.round(Math.min(110, Math.max(40, viewportHeight * 0.12))),
  backward: 28,
});

/** Below this the page is already in place; moving it would only be noise. */
const AT_REST = 2;

/** The scroll position to ease to, or null to leave the page where it stopped. */
export function settleTarget({ scrollY, viewportHeight, barHeight, maxScroll, edges, direction }: SettleInput): number | null {
  const reach = settleReach(viewportHeight);
  let best: number | null = null;
  for (const edge of edges) {
    const offset = edge.kind === "start" ? edge.top - barHeight : edge.bottom - viewportHeight;
    const target = Math.min(maxScroll, Math.max(0, Math.round(scrollY + offset)));
    const delta = target - scrollY;
    if (Math.abs(delta) < AT_REST) return null;
    const withVisitor = direction === 0 || Math.sign(delta) === direction;
    const limit = direction === 0 ? reach.backward + 12 : withVisitor ? reach.forward : reach.backward;
    if (Math.abs(delta) > limit) continue;
    if (best === null || Math.abs(delta) < Math.abs(best - scrollY)) best = target;
  }
  return best;
}

/** Long enough to read as the scroll coasting to a stop, never as a jump. */
export const settleDuration = (distance: number) => Math.round(Math.min(560, Math.max(280, 240 + distance * 2.6)));

/** Ease-out: the move starts at the speed a coasting scroll would have and fades out. */
export const settleEase = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
