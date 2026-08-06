import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";

/**
 * `/customer/signup` is retained for old bookmarks and the deterministic local
 * preview. Production members should enter Clerk directly so an obsolete form
 * never paints before authentication loads.
 */
export default function CustomerSignupLayout({ children }: { children: ReactNode }) {
  if (!DEMO_AUTH_BYPASS) redirect("/login/member/create");
  return children;
}
