/**
 * Class finder shared by the Convex query and playbook and the preview
 * adapter. Eligibility, audience and capacity come from the class records and
 * the member's memberships; RIVET only filters and orders them. A delegated
 * booking needs an open spot: it never joins a waitlist the person did not
 * ask for, and the spot is rechecked in the same transaction as the booking.
 */

export type ClassTimeOfDay = "morning" | "afternoon" | "evening";

export interface ClassOptionFacts {
  occurrenceId: string;
  name: string;
  branchId: string;
  branchName: string;
  date: string;
  startsAt: string;
  endsAt: string;
  /** Minutes after local midnight in the gym's timezone. */
  startMinuteLocal: number;
  audience: string;
  coachName?: string;
  status: string;
  capacity: number;
  bookedCount: number;
  memberBooked: boolean;
  memberEligible: boolean;
  audienceFits: boolean;
}

export interface ClassOption extends ClassOptionFacts {
  spotsLeft: number;
  timeOfDay: ClassTimeOfDay;
}

export type ClassExclusion = "started" | "not_eligible" | "audience" | "already_booked" | "full";

export const CLASS_FINDER_DAYS = 7;
export const CLASS_FINDER_LIMIT = 12;

export function classTimeOfDay(startMinuteLocal: number): ClassTimeOfDay {
  return startMinuteLocal < 12 * 60 ? "morning" : startMinuteLocal < 17 * 60 ? "afternoon" : "evening";
}

/** Why a class cannot be offered for a delegated booking, or undefined when it can. */
export function classExclusion(facts: ClassOptionFacts, now: string): ClassExclusion | undefined {
  if (facts.status !== "scheduled" || facts.startsAt <= now) return "started";
  if (!facts.memberEligible) return "not_eligible";
  if (!facts.audienceFits) return "audience";
  if (facts.memberBooked) return "already_booked";
  if (facts.bookedCount >= facts.capacity) return "full";
  return undefined;
}

export function classOptions(facts: ClassOptionFacts[], context: { now: string; timeOfDay?: ClassTimeOfDay; limit?: number }): { options: ClassOption[]; excluded: Partial<Record<ClassExclusion, number>> } {
  const excluded: Partial<Record<ClassExclusion, number>> = {};
  const options: ClassOption[] = [];
  for (const item of [...facts].sort((left, right) => left.startsAt.localeCompare(right.startsAt))) {
    const timeOfDay = classTimeOfDay(item.startMinuteLocal);
    if (context.timeOfDay && timeOfDay !== context.timeOfDay) continue;
    const reason = classExclusion(item, context.now);
    if (reason) { excluded[reason] = (excluded[reason] ?? 0) + 1; continue; }
    options.push({ ...item, spotsLeft: item.capacity - item.bookedCount, timeOfDay });
  }
  return { options: options.slice(0, context.limit ?? CLASS_FINDER_LIMIT), excluded };
}
