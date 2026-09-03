import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { TermsOfService } from "@/features/legal/terms-of-service";

export const metadata: Metadata = {
  title: "Terms of service · RIVET",
  description: "The terms on which RIVET provides its website and platform, including the data processing addendum.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <PublicHeader />
      <main><TermsOfService /></main>
      <PublicFooter />
    </div>
  );
}
