import type { ReactNode } from "react";

/**
 * Re-mounts on every route change within this shell, so each page enters with
 * the same brief rise-and-fade instead of popping in. Reduced-motion users get
 * an instant swap via the global animation override.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-transition">{children}</div>;
}
