import type { Metadata } from "next";
import { ArabicReviewRoom } from "@/features/arabic-review/review-room";
export const metadata: Metadata = {
  title: "Arabic review",
  robots: { index: false, follow: false },
};
export default function ArabicRoomPage() {
  return <ArabicReviewRoom />;
}
