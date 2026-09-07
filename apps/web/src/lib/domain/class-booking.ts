import type { ClassBookingStatus } from "./types";

/** A booking that still occupies a place or a waitlist position. */
export function classBookingIsActive(status: ClassBookingStatus): boolean {
  return status === "booked" || status === "waitlisted";
}

/** A booking that takes a seat: confirmed, or already resolved as attended / no-show. */
export function classBookingTakesSeat(status: ClassBookingStatus): boolean {
  return status === "booked" || status === "attended" || status === "no_show";
}

export interface ClassCancellationPreview {
  outcome: "cancelled" | "late_cancelled" | "leave_waitlist" | "closed";
  /** Last instant at which a confirmed place can be given up without a late record. */
  freeUntil?: number;
  text: string;
}

/**
 * What cancelling this booking will be recorded as, using the same rule both
 * adapters apply: only a confirmed place can be a late cancellation, leaving
 * the waitlist frees no seat, and nothing can be cancelled once the class has
 * ended. The gym applies no fee or membership penalty to a late cancellation.
 */
export function classCancellationPreview(input: {
  startsAt: string;
  endsAt: string;
  bookingStatus: ClassBookingStatus;
  cutoffHours: number;
  now?: number;
}): ClassCancellationPreview {
  const now = input.now ?? Date.now();
  if (Date.parse(input.endsAt) <= now) return { outcome: "closed", text: "This class has ended, so the booking can no longer be cancelled." };
  if (input.bookingStatus === "waitlisted") return { outcome: "leave_waitlist", text: "You will leave the waitlist. Nothing else changes." };
  const freeUntil = Date.parse(input.startsAt) - input.cutoffHours * 3_600_000;
  if (now > freeUntil) {
    return { outcome: "late_cancelled", freeUntil, text: `This is inside the gym's ${input.cutoffHours}-hour cutoff, so it is recorded as a late cancellation. No fee or membership penalty applies, and your place is offered to the waitlist.` };
  }
  return { outcome: "cancelled", freeUntil, text: "Your place is released and offered to the waitlist." };
}
