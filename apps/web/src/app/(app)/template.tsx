import type { ReactNode } from "react";

/**
 * Re-mounts on every route change within the workspace. The new page settles
 * in with a short opacity change (`.page-transition`: 60% to 100% in 140ms) so it never pops, and never waits: an earlier
 * rise-and-fade made every opened page wait a quarter of a second before it
 * could be read. No movement, and nothing is left on the wrapper afterwards.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-transition">{children}</div>;
}
