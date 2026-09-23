"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import type { GymProfileReviewContext, GymPublicProfile, ProfilePassage, ProfilePassageFinding, ProfileTextField } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { useAssistJudgment } from "@/features/assist/use-assist-judgment";
import { SettingsPanel } from "@/features/settings/settings-layout";
import { PROFILE_FIELD_LABELS, profileUncheckedClaims, resolveLanguageGapReading, resolveProfileClaimReading } from "../../../convex/profileAssist";

/** Focus the editor field a passage came from and select that passage; an explicit action, never automatic. */
export function locateProfilePassage(field: ProfileTextField, text: string): void {
  if (typeof document === "undefined") return;
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-profile-field="${field}"]`);
  if (!element) return;
  element.focus();
  const start = element.value.indexOf(text);
  if (start >= 0 && typeof element.setSelectionRange === "function") element.setSelectionRange(start, start + text.length);
  element.scrollIntoView?.({ block: "center" });
}

function ServicesSummary({ context }: { context: GymProfileReviewContext }) {
  const { services } = context;
  const list = (names: string[]) => (names.length ? ` (${names.slice(0, 6).join(", ")}${names.length > 6 ? ", …" : ""})` : "");
  return (
    <dl className="grid gap-x-4 gap-y-1 text-[12.5px] leading-5 text-ink-2 sm:grid-cols-2" data-testid="profile-review-services">
      <div><dt className="inline font-medium text-ink">Branches: </dt><dd className="inline">{services.branches.count}{list(services.branches.names)}</dd></div>
      <div><dt className="inline font-medium text-ink">Published trainers: </dt><dd className="inline">{services.trainers.publishedCount}{list(services.trainers.names)}</dd></div>
      <div><dt className="inline font-medium text-ink">Active PT packages: </dt><dd className="inline">{services.ptPackages.count}</dd></div>
      <div><dt className="inline font-medium text-ink">Active plans: </dt><dd className="inline">{services.plans.count} · freezing {services.plans.freezeAvailable ? "allowed on at least one" : "on none"} · every-branch access {services.plans.multiBranchAccess ? "on at least one" : "on none"}</dd></div>
      <div><dt className="inline font-medium text-ink">Scheduled classes: </dt><dd className="inline">{services.classes.count}</dd></div>
      <div><dt className="inline font-medium text-ink">Audience: </dt><dd className="inline">{services.audience} · amenities: {services.amenities.length ? services.amenities.join(", ") : "none chosen"}</dd></div>
    </dl>
  );
}

function Findings({ findings, testId }: { findings: ProfilePassageFinding[]; testId: string }) {
  return (
    <ul className="space-y-2" data-testid={testId}>
      {findings.map(({ passage, evidence }) => (
        <li key={passage.id} className="rounded-md border border-line bg-sunken/40 p-2.5" data-testid={`${testId}-item`} data-passage-id={passage.id}>
          <p className="text-[12px] text-ink-3">{PROFILE_FIELD_LABELS[passage.field]}</p>
          <blockquote dir={passage.lang === "ar" ? "rtl" : "ltr"} lang={passage.lang} className="mt-0.5 border-s-2 border-warning ps-2 text-[13px] leading-5 text-ink">“{passage.text}”</blockquote>
          <p className="mt-1 text-[12.5px] text-ink-2" data-testid={`${testId}-evidence`}>{evidence}</p>
          <Button type="button" size="xs" variant="ghost" className="mt-1" onClick={() => locateProfilePassage(passage.field, passage.text)}>Locate in editor</Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The explicit draft-review action on the public-profile editor. It reads
 * the saved draft (unsaved edits must be saved or discarded first), lists
 * what the gym's records say, and asks Jev two bounded questions over the
 * draft's own passages: which the records contradict, and which the other
 * language does not state. Findings quote the passage by validated id and
 * can be located in the editor. Nothing is rewritten, translated, published
 * or blocked; the Save and Send actions stay exactly as they were.
 */
export function ProfileDraftReview({ profile, dirty }: { profile: GymPublicProfile; dirty: boolean }) {
  const [requested, setRequested] = useState(false);
  // The saved draft the editor currently sees keys everything: a newer save
  // re-reads the context and re-asks, and findings are read only against a
  // context that matches it.
  const subject = { version: profile.version, updatedAt: profile.updatedAt };
  const canCompare = Boolean((profile.taglineAr ?? "").trim() || (profile.descriptionAr ?? "").trim());
  const context = useApiQuery([...qk.gymProfileReview, profile.version, profile.updatedAt], (api) => api.getGymProfileReviewContext(), { enabled: requested, staleTime: 0, refetchOnWindowFocus: false });
  const claims = useAssistJudgment({ questionKey: "profile.claim_check", subject, enabled: true, auto: requested });
  const gap = useAssistJudgment({ questionKey: "profile.language_gap", subject, enabled: canCompare, auto: requested && canCompare });

  if (!claims.status || !claims.featureReady) return null;

  const current = context.data && context.data.version === profile.version && context.data.updatedAt === profile.updatedAt ? context.data : undefined;
  // The server holds a different saved draft than this editor shows (someone else saved): say so instead of reading findings against it.
  const stale = Boolean(requested && context.data && !current);
  const claimReading = current && claims.state.status === "ready" ? resolveProfileClaimReading(claims.state.result.judgment, current) : undefined;
  const gapReading = current && gap.state.status === "ready" ? resolveLanguageGapReading(gap.state.result.judgment, current) : undefined;
  const unchecked = current ? profileUncheckedClaims(current) : [];
  const review = () => {
    if (!requested) {
      setRequested(true);
      return;
    }
    void context.refetch();
    claims.request();
    if (canCompare) gap.request();
  };
  const disabledReason = dirty ? "Save or discard the unsaved edits first; the review reads the saved draft." : undefined;

  return (
    <SettingsPanel
      title="Draft review"
      description="Compares the saved draft with your recorded services and checks that the Arabic and English text say the same things. Each check suggests at most one passage; other passages have not been individually cleared. Nothing is rewritten, translated or published."
      testId="profile-draft-review"
      control={<Button type="button" size="sm" variant="secondary" data-testid="profile-review-run" disabled={Boolean(disabledReason)} title={disabledReason} loading={requested && (context.isLoading || claims.state.status === "loading")} onClick={review}><Sparkles /> {requested ? "Review again" : "Review saved draft"}</Button>}
    >
      <div className="space-y-3 p-4 sm:p-5">
        {!requested ? <p className="text-[12.5px] leading-5 text-ink-3">Reads draft v{profile.version} as saved. Unsaved edits are not reviewed.</p> : null}
        {stale ? <p className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12.5px] text-warning-deep" data-testid="profile-review-stale">The saved draft on the server differs from the one shown here. Reload the page, then review again.</p> : null}
        {requested && !stale && current ? <ServicesSummary context={current} /> : null}
        {requested && !stale ? (
          <>
            <AssistSuggestion
              suggestion={claims}
              title="Claims against the records"
              testId="profile-claims"
              render={() => claimReading
                ? claimReading.clear
                  ? <p data-testid="profile-claims-clear">No contradiction was selected. This is not verification of every claim.</p>
                  : <Findings findings={claimReading.findings} testId="profile-claims-findings" />
                : <p>The review could not be read against the saved draft. Review again.</p>}
            />
            {current && claims.state.status === "ready" ? (
              <div className="text-[12.5px] leading-5 text-ink-3" data-testid="profile-unchecked">
                {unchecked.length
                  ? <>Not covered by records, so unknown rather than false: {unchecked.map((entry) => `“${entry.passage.text.length > 60 ? `${entry.passage.text.slice(0, 60)}…` : entry.passage.text}” (${entry.concepts.join(", ")})`).join("; ")}.</>
                  : <>Silence in the records is never a contradiction; anything they do not cover stays unknown.</>}
              </div>
            ) : null}
            {canCompare ? (
              <AssistSuggestion
                suggestion={gap}
                title="Arabic and English"
                testId="profile-language"
                render={() => gapReading
                  ? gapReading.aligned
                    ? <p data-testid="profile-language-clear">No meaningful difference was selected. This is not verification of every passage.</p>
                    : <Findings findings={gapReading.findings} testId="profile-language-findings" />
                  : <p>The comparison could not be read against the saved draft. Review again.</p>}
              />
            ) : <p className="text-[12.5px] leading-5 text-ink-3" data-testid="profile-language-unavailable">Add an Arabic tagline or description to compare the two languages.</p>}
            {context.isError ? <p className="text-[12.5px] text-ink-3">The recorded services could not be loaded; findings cannot be read without them.</p> : null}
          </>
        ) : null}
      </div>
    </SettingsPanel>
  );
}

export type { ProfilePassage };
