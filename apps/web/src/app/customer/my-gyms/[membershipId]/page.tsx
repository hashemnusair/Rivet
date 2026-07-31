import { INITIAL_CUSTOMER_MEMBERSHIPS } from "@/lib/public/experience-data";
import MembershipDetailClient from "./membership-detail.client";

export function generateStaticParams() {
  return INITIAL_CUSTOMER_MEMBERSHIPS.map((membership) => ({ membershipId: membership.id }));
}

export default async function MembershipDetailPage({ params }: { params: Promise<{ membershipId: string }> }) {
  return <MembershipDetailClient membershipId={(await params).membershipId} />;
}
