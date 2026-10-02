"use client";

import { CalendarClock, UserRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/ui/states";
import type { PtTrainerSetupState } from "@/lib/domain/personal-training";

/**
 * Tells a trainer why nobody can book them yet and who fixes it. Profile
 * linking and publication are owner/manager work; weekly hours are the
 * trainer's own, so that step gets a direct action when the caller has one.
 */
export function TrainerSetupNotice({ state, onSetAvailability, availabilityHref = "/pt", className }: {
  state: PtTrainerSetupState;
  /** Opens the availability editor in place; omit to link to the PT workspace instead. */
  onSetAvailability?: (state: Extract<PtTrainerSetupState, { kind: "unpublished" | "no_hours" }>) => void;
  availabilityHref?: string;
  className?: string;
}) {
  if (state.kind === "ready") return null;
  const availabilityAction = state.kind === "no_profile" ? null : onSetAvailability
    ? <Button size="sm" variant="secondary" onClick={() => onSetAvailability(state)}><CalendarClock /> Set availability</Button>
    : <Button asChild size="sm" variant="secondary"><Link href={availabilityHref}><CalendarClock /> Set availability</Link></Button>;
  if (state.kind === "no_profile") {
    return <div data-testid="trainer-setup-notice"><StatePanel icon={UserRound} layout="section" className={className} title="Your trainer profile is not set up yet" description="An owner or manager links a profile to your account in Personal training. Until then, nobody can book sessions with you." /></div>;
  }
  if (state.kind === "unpublished") {
    const archived = state.profile.status === "archived";
    return <div data-testid="trainer-setup-notice"><StatePanel icon={UserRound} layout="section" className={className} title={archived ? "Your trainer profile is archived" : "Your trainer profile is still a draft"} description={`${archived ? "Members cannot book you while your profile is archived." : "Members cannot book you until an owner or manager publishes your profile."} You can set your weekly hours and time off now. Bookings open as soon as your profile is published.`} action={availabilityAction} /></div>;
  }
  return <div data-testid="trainer-setup-notice"><StatePanel icon={CalendarClock} layout="section" className={className} title="Add your weekly hours" description="Nobody can book you until you save the days and times you work at your branch." action={availabilityAction} /></div>;
}
