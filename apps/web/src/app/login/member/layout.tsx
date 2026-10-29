import type { Metadata } from "next";
import { MEMBER_APP_METADATA } from "@/lib/pwa/member-manifest";

// A member who adds RIVET from the sign-in page still gets the member app.
export const metadata: Metadata = MEMBER_APP_METADATA;

export default function MemberLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
