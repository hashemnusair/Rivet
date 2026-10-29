import type { Metadata } from "next";
import { MEMBER_MANIFEST_PATH } from "@/lib/pwa/member-manifest";

// A member who adds RIVET from the sign-in page still gets the member app.
export const metadata: Metadata = { manifest: MEMBER_MANIFEST_PATH };

export default function MemberLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
