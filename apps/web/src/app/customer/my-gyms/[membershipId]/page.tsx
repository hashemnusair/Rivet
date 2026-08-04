import MembershipDetailClient from "./membership-detail.client";

export const dynamicParams = true;

export default async function MembershipDetailPage({ params }: { params: Promise<{ membershipId: string }> }) {
  return <MembershipDetailClient membershipId={(await params).membershipId} />;
}
