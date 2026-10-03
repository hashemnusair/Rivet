"use client";
import { useT } from "@/lib/i18n/provider";

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
  const t = useT();
  if (state.kind === "ready") return null;
  const availabilityAction = state.kind === "no_profile" ? null : onSetAvailability
    ? <Button size="sm" variant="secondary" onClick={() => onSetAvailability(state)}><CalendarClock /> {" "}{t("ptWorkspace.setAvailability")}</Button>
    : <Button asChild size="sm" variant="secondary"><Link href={availabilityHref}><CalendarClock /> {" "}{t("ptWorkspace.setAvailability")}</Link></Button>;
  if (state.kind === "no_profile") {
    return <div data-testid="trainer-setup-notice"><StatePanel icon={UserRound} layout="section" className={className} title={t("ptWorkspace.profileNotReady")} description={t("ptWorkspace.profileNotReadyHint")} /></div>;
  }
  if (state.kind === "unpublished") {
    const archived = state.profile.status === "archived";
    return <div data-testid="trainer-setup-notice"><StatePanel icon={UserRound} layout="section" className={className} title={archived ? t("ptWorkspace.profileArchived") : t("ptWorkspace.profileDraft")} description={t("ptWorkspace.setupHoursHint", { status: archived ? t("ptWorkspace.archivedBookingHint") : t("ptWorkspace.draftBookingHint") })} action={availabilityAction} /></div>;
  }
  return <div data-testid="trainer-setup-notice"><StatePanel icon={CalendarClock} layout="section" className={className} title={t("ptWorkspace.addHours")} description={t("ptWorkspace.addHoursHint")} action={availabilityAction} /></div>;
}
