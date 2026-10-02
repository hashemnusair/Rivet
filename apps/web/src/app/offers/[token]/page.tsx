import type { Metadata } from "next";
import PublicOfferClient from "./public-offer.client";

export const dynamicParams = true;

export const metadata: Metadata = {
  title: "Membership offer",
  robots: { index: false, follow: false },
};

export default async function PublicOfferPage({ params }: { params: Promise<{ token: string }> }) {
  return <PublicOfferClient token={(await params).token} />;
}
