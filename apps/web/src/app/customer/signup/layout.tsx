import type { ReactNode } from "react";

/**
 * Keep the historical `/customer/signup` URL as a real member signup entry.
 * The page itself selects the Clerk flow in production and a non-creating
 * seeded preview notice when deterministic demo auth is enabled.
 */
export default function CustomerSignupLayout({ children }: { children: ReactNode }) {
  return children;
}
