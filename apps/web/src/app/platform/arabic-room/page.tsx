import type { Metadata } from "next";
import { ArabicReviewRoom } from "@/features/arabic-review/review-room";

export const metadata: Metadata = {
  title: "Arabic review",
  robots: { index: false, follow: false },
};

// Inside the platform console on purpose: the shell requires a signed-in
// platform administrator, and every review endpoint checks it again.
export default function ArabicRoomPage() {
  return <ArabicReviewRoom />;
}
