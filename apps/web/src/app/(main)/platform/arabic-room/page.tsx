import { redirect } from "next/navigation";
export default async function LegacyArabicRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string }>;
}) {
  const { card } = await searchParams;
  redirect(`/arabic-room${card ? `?card=${encodeURIComponent(card)}` : ""}`);
}
