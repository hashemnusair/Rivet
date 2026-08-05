import GymDetailClient from "./gym-detail.client";

export const dynamicParams = true;

export default async function GymDetailPage({ params }: { params: Promise<{ gymId: string }> }) {
  return <GymDetailClient gymId={(await params).gymId} />;
}
