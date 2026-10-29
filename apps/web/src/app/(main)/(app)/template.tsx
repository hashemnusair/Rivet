import type { ReactNode } from "react";

/**
 * Re-mounts on every route change within the workspace. Pages switch
 * instantly, the way X or Instagram change screens: a rise-and-fade here made
 * every opened page wait a quarter of a second before it could be read.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
