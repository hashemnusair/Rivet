import type { Metadata } from "next";
import { CustomerShell } from "@/components/public/public-shell";
import { MEMBER_MANIFEST_PATH } from "@/lib/pwa/member-manifest";

// Member pages are the only ones that offer the member app.
export const metadata: Metadata = { manifest: MEMBER_MANIFEST_PATH };

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
