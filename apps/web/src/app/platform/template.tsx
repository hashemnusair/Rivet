import type { ReactNode } from "react";

/**
 * Re-mounts on every route change within this shell, so each page settles in
 * with the same short opacity change as the gym workspace instead of popping
 * in. No rise: the movement read as a jolt and a wait. Reduced-motion users
 * get an instant swap via the global animation override.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-transition">{children}</div>;
}
