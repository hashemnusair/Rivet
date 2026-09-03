import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { PrivacyPolicy } from "@/features/legal/privacy-policy";

export const metadata: Metadata = {
  title: "Privacy policy · RIVET",
  description: "What RIVET collects, why, who it is shared with, how long it is kept, and what you can do about it.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <PublicHeader />
      <main><PrivacyPolicy /></main>
      <PublicFooter />
    </div>
  );
}
