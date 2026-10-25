"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/switch";
import type { AiNoteExtraction } from "@/lib/ai/contracts";
import { fieldSuggestions, type ContactFormState } from "@/lib/ai/note-extraction";
import { useApiMutation } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import type { TKey } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/provider";
import { useAiErrorText } from "./ai-message";

export interface NoteAssistRemember {
  travelUntil?: { date: string; evidence: string };
  contactTime?: "morning" | "afternoon" | "evening";
}

/**
 * "Fill from note" beside the notes field. RIVET reads the note into
 * suggestions; the person uses one field or all. A field they already set
 * is never replaced. Lasting notes (travel, preferred call time) are saved
 * only if the person ticks them, and only after the contact itself saves.
 */
export function NoteAssist({
  subject,
  memberId,
  leadId,
  note,
  form,
  onApplyOutcome,
  onApplyFollowUp,
  onRememberChange,
}: {
  subject: "member" | "lead";
  memberId?: string;
  leadId?: string;
  note: string;
  form: ContactFormState;
  onApplyOutcome: (outcome: string) => void;
  onApplyFollowUp: (date: string, time?: string) => void;
  onRememberChange: (remember: NoteAssistRemember) => void;
}) {
  const { t, locale } = useLocale();
  const format = useFormat();
  const errorText = useAiErrorText();
  const [extraction, setExtraction] = useState<AiNoteExtraction | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [remember, setRemember] = useState<NoteAssistRemember>({});
  const read = useApiMutation((api, text: string) => api.extractContactNote({ ...(subject === "member" ? { memberId } : { leadId }), note: text, noteAt: new Date().toISOString(), locale: locale === "ar" ? "ar" : "en" }), {
    onSuccess: (result) => {
      if (result.ok) {
        setExtraction(result.extraction);
        setFailure(undefined);
        setUsed(new Set());
      } else {
        setExtraction(undefined);
        setFailure(errorText(result.reason));
      }
    },
  });
  const updateRemember = (next: NoteAssistRemember) => {
    setRemember(next);
    onRememberChange(next);
  };
  const suggestions = extraction ? fieldSuggestions(extraction, form) : [];
  const apply = (field: string, value: string, time?: string) => {
    if (field === "outcome") onApplyOutcome(value);
    if (field === "nextFollowUp") onApplyFollowUp(value, time);
    setUsed((current) => new Set(current).add(field));
  };
  const usable = suggestions.filter((item) => (item.field === "outcome" || item.field === "nextFollowUp") && !item.blockedByEdit && !item.needsChoice);
  const enough = note.trim().length >= 8;
  return (
    <div className="space-y-2" data-testid="note-assist">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="xs" disabled={!enough} loading={read.isPending} onClick={() => read.mutate(note)} data-testid="note-assist-fill">{read.isPending ? t("aiWork.extract.reading") : t("aiWork.extract.fill")}</Button>
        {extraction?.source === "fixture" ? <Badge variant="outline">{t("aiWork.extract.testMode")}</Badge> : null}
      </div>
      {failure ? <p role="status" className="text-[12px] text-ink-3" data-testid="note-assist-failure">{failure}</p> : null}
      {extraction ? (
        <div className="space-y-2 rounded-md border border-line bg-surface px-3 py-2.5" data-testid="note-assist-suggestions" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="context-label">{t("aiWork.extract.title")}</p>
            {usable.length > 1 ? <Button type="button" variant="ghost" size="xs" onClick={() => usable.forEach((item) => apply(item.field, item.value, item.time))} data-testid="note-assist-use-all">{t("aiWork.extract.acceptAll")}</Button> : null}
          </div>
          {extraction.ignoredInstructions ? <p className="text-[12px] text-warning-deep">{t("aiWork.extract.ignoredInstructions")}</p> : null}
          {suggestions.length === 0 ? <p className="text-[12.5px] text-ink-3">{t("aiWork.extract.nothingFound")}</p> : null}
          <ul className="space-y-2">
            {suggestions.map((item) => {
              const label = item.field === "outcome"
                ? t(`memberProfile.contact.outcome.${item.value}` as TKey)
                : item.field === "nextFollowUp"
                  ? `${format.date(item.value)}${item.time ? ` · ${format.clock(item.time)}` : ""}`
                  : item.field === "travelUntil"
                    ? format.date(item.value)
                    : item.field === "renewalInterest"
                      ? t(`aiWork.extract.interest.${item.value}` as TKey)
                      : t("aiWork.extract.preferredTime", { time: t(`aiWork.timeOfDay.${item.value}` as TKey) });
              const fieldLabel = t(`aiWork.extract.fields.${item.field}` as TKey);
              return (
                <li key={item.field} className="space-y-1 text-[12.5px]" data-testid={`note-assist-${item.field}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-ink-3">{fieldLabel}:</span>
                    <span className="font-medium text-ink" dir="auto">{label}</span>
                    {(item.field === "outcome" || item.field === "nextFollowUp") && !item.blockedByEdit && !item.needsChoice ? (
                      used.has(item.field)
                        ? <Badge variant="success">{t("aiWork.extract.used")}</Badge>
                        : <Button type="button" variant="ghost" size="xs" onClick={() => apply(item.field, item.value, item.time)} data-testid={`note-assist-use-${item.field}`}>{t("aiWork.extract.accept")}</Button>
                    ) : null}
                  </div>
                  {item.blockedByEdit ? <p className="text-[12px] text-ink-3">{t("aiWork.extract.keepYours")}</p> : null}
                  {item.needsChoice && (item.field === "nextFollowUp" || item.field === "travelUntil") ? (
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("aiWork.extract.pickDate")}>
                      <span className="text-[12px] text-ink-3">{t("aiWork.extract.pickDate")}</span>
                      {[{ date: item.value, time: item.time }, ...item.alternatives].map((option) => (
                        <Button key={`${option.date}-${option.time ?? ""}`} type="button" variant="secondary" size="xs" onClick={() => {
                          if (item.field === "nextFollowUp") apply("nextFollowUp", option.date, option.time);
                          else updateRemember({ ...remember, travelUntil: { date: option.date, evidence: item.evidence } });
                          setExtraction((current) => current ? resolveChoice(current, item.field as "nextFollowUp" | "travelUntil", option.date, option.time) : current);
                        }}>{`${format.date(option.date)}${option.time ? ` · ${format.clock(option.time)}` : ""}`}</Button>
                      ))}
                    </div>
                  ) : null}
                  {item.field === "travelUntil" && !item.needsChoice && subject === "member" ? (
                    <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                      <Checkbox checked={remember.travelUntil?.date === item.value} onCheckedChange={(checked) => updateRemember({ ...remember, travelUntil: checked === true ? { date: item.value, evidence: item.evidence } : undefined })} data-testid="note-assist-remember-travel" />
                      {t("aiWork.extract.rememberTravel", { date: format.date(item.value) })}
                    </label>
                  ) : null}
                  {item.field === "preferredContactTime" && subject === "member" ? (
                    <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                      <Checkbox checked={remember.contactTime === item.value} onCheckedChange={(checked) => updateRemember({ ...remember, contactTime: checked === true ? item.value as NoteAssistRemember["contactTime"] : undefined })} data-testid="note-assist-remember-time" />
                      {t("aiWork.extract.preferredTime", { time: t(`aiWork.timeOfDay.${item.value}` as TKey) })}
                    </label>
                  ) : null}
                  <p className="text-[12px] text-ink-3" dir="auto">{t("aiWork.extract.evidence", { text: item.evidence })}</p>
                </li>
              );
            })}
          </ul>
          {extraction.clarifications.filter((item) => !suggestions.some((suggestion) => suggestion.field === (item.field === "followUp" ? "nextFollowUp" : item.field) && suggestion.needsChoice)).map((item) => (
            <p key={`${item.field}-${item.messageKey}`} className="text-[12px] text-warning-deep" data-testid="note-assist-clarification">{t(item.messageKey as TKey)}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** After a person picks a reading, the suggestion settles on it. */
function resolveChoice(extraction: AiNoteExtraction, field: "nextFollowUp" | "travelUntil", date: string, time?: string): AiNoteExtraction {
  const key = field === "nextFollowUp" ? "followUp" : "travelUntil";
  const current = extraction[key];
  if (!current) return extraction;
  return {
    ...extraction,
    [key]: { ...current, value: { ...current.value, date, ...(time ? { time } : {}), alternatives: undefined } },
    clarifications: extraction.clarifications.filter((item) => item.field !== (field === "nextFollowUp" ? "followUp" : "travelUntil")),
  };
}
