import { MARKETPLACE_GYMS } from "@/lib/public/experience-data";
import GymDetailClient from "./gym-detail.client";

export function generateStaticParams() {
  return MARKETPLACE_GYMS.map((gym) => ({ gymId: gym.id }));
}

export default async function GymDetailPage({ params }: { params: Promise<{ gymId: string }> }) {
  return <GymDetailClient gymId={(await params).gymId} />;
}
