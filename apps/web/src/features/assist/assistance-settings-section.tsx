"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { ErrorState } from "@/components/ui/states";
import { Checkbox } from "@/components/ui/switch";
import { SettingsPanel, SettingsSaveBar, SettingsSection, SettingsToggleRow } from "@/features/settings/settings-layout";
import type { AiCapabilityKey, AiSettingsView, AiStandingInstructionView, AiStandingPreview, AiTenantMode } from "@/lib/ai/contracts";
import { PREPARE_ONLY_CAPABILITIES } from "@/lib/ai/capabilities";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import type { TKey } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/provider";
import { useApp } from "@/lib/providers/app-providers";
import { useAiSettings } from "./use-assist";

/** Capabilities this release can actually run; the rest stay listed as off until their slice ships. */
const SHOWN_CAPABILITIES: AiCapabilityKey[] = ["member_context", "note_extraction", "followup_batch", "report_job", "handover_job", "cash_difference", "sales_followups", "ops_triage", "class_finder", "nl_filters"];

type Draft = { tenantMode: AiTenantMode; externalProcessing: boolean; capabilities: Partial<Record<AiCapabilityKey, AiTenantMode>> };

function draftFrom(settings: AiSettingsView): Draft {
  return {
    tenantMode: settings.tenantMode,
    externalProcessing: settings.externalProcessing,
    capabilities: Object.fromEntries(settings.capabilities.map((item) => [item.key, item.mode])) as Draft["capabilities"],
  };
}

function ProviderStatus({ settings }: { settings: AiSettingsView }) {
  const { t } = useLocale();
  const text = settings.globalStop ? t("aiWork.settings.stoppedEverywhere") : settings.adapterMode === "fixture" ? t("aiWork.settings.providerTest") : settings.adapterMode === "live" && settings.adapterReady ? t("aiWork.settings.providerLive") : t("aiWork.settings.providerOff");
  return <p className="text-[12.5px] text-ink-2" data-testid="assistance-provider">{text}</p>;
}

function StandingInstructions() {
  const { t, locale } = useLocale();
  const format = useFormat();
  const { session } = useApp();
  const invalidate = useInvalidate();
  const standing = useApiQuery<AiStandingInstructionView[]>(qk.aiStanding, (api) => api.listStandingInstructions());
  const [adding, setAdding] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [time, setTime] = useState("09:00");
  const [preview, setPreview] = useState<AiStandingPreview | undefined>();
  const params = useMemo(() => ({ bucket: "expiring", owner: "me" }), []);
  const requestKey = useRef(crypto.randomUUID());
  const runPreview = useApiMutation((api, _unused: void) => api.previewStandingInstruction({ playbook: "renewal_followups", params, ...(session?.activeBranchId ? { branchId: session.activeBranchId } : {}) }), { onSuccess: (value) => setPreview(value) });
  const create = useApiMutation((api, digest: string) => api.createStandingInstruction({ playbook: "renewal_followups", params, schedule: { weekdays, time }, requestKey: requestKey.current, previewDigest: digest, ...(session?.activeBranchId ? { branchId: session.activeBranchId } : {}) }), {
    successMessage: t("aiWork.settings.saved"),
    onSuccess: async () => {
      setAdding(false);
      setPreview(undefined);
      requestKey.current = crypto.randomUUID();
      await invalidate([qk.aiStanding]);
    },
    onError: () => setPreview(undefined),
  });
  const update = useApiMutation((api, input: { standingId: string; action: "pause" | "resume" | "revoke" }) => api.updateStandingInstruction(input), { onSuccess: async () => { await invalidate([qk.aiStanding]); } });
  const counts = preview ? { create: preview.subjects.filter((item) => item.decision === "create").length, link: preview.subjects.filter((item) => item.decision === "link").length, exclude: preview.subjects.filter((item) => item.decision === "exclude").length } : undefined;
  return (
    <SettingsPanel title={t("aiWork.settings.standingTitle")} testId="assistance-standing" control={!adding ? <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)} data-testid="assistance-standing-add">{t("aiWork.settings.standingAdd")}</Button> : undefined}>
      {standing.isLoading ? <Skeleton className="h-12 w-full" /> : (standing.data ?? []).length === 0 && !adding ? <p className="text-[12.5px] text-ink-3">{t("aiWork.settings.standingEmpty")}</p> : null}
      <ul className="divide-y divide-line">
        {(standing.data ?? []).map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5" data-testid="assistance-standing-item">
            <div className="min-w-0 text-[12.5px]">
              <p className="font-medium text-ink">{t(item.title as TKey)}{item.branchName ? <span className="font-normal text-ink-3"> · <bdi>{item.branchName}</bdi></span> : null}</p>
              <p className="text-ink-3">{item.schedule.weekdays.map((day) => t(`aiWork.settings.weekday.${day}` as TKey)).join(locale === "ar" ? "، " : ", ")} · {format.clock(item.schedule.time)} · {t("aiWork.settings.standingOwner", { name: item.ownerName })}</p>
              {item.status === "paused" ? <Badge variant="warning">{t("aiWork.settings.standingPaused")}</Badge> : item.nextRunAt ? <p className="text-ink-3">{t("aiWork.settings.standingNext", { at: format.dateTime(item.nextRunAt) })}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {item.status === "active" ? <Button type="button" variant="ghost" size="xs" onClick={() => update.mutate({ standingId: item.id, action: "pause" })}>{t("aiWork.settings.pause")}</Button> : <Button type="button" variant="ghost" size="xs" onClick={() => update.mutate({ standingId: item.id, action: "resume" })}>{t("aiWork.settings.resume")}</Button>}
              <Button type="button" variant="ghost" size="xs" onClick={() => update.mutate({ standingId: item.id, action: "revoke" })} data-testid="assistance-standing-revoke">{t("aiWork.settings.turnOff")}</Button>
            </div>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="mt-3 space-y-3 rounded-md border border-line p-3" data-testid="assistance-standing-form">
          <p className="text-[13px] font-medium text-ink">{t("aiWork.goal.renewalFollowups")}</p>
          <fieldset className="space-y-1.5">
            <legend className="text-[12px] font-medium text-ink-2">{t("aiWork.settings.days")}</legend>
            <div className="flex flex-wrap gap-3">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <label key={day} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                  <Checkbox checked={weekdays.includes(day)} onCheckedChange={(checked) => { setPreview(undefined); setWeekdays((current) => checked === true ? [...current, day].sort() : current.filter((value) => value !== day)); }} />
                  {t(`aiWork.settings.weekday.${day}` as TKey)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t("aiWork.settings.time")} htmlFor="standing-time">
            <Input id="standing-time" type="time" dir="ltr" value={time} onChange={(event) => { setPreview(undefined); setTime(event.target.value); }} className="w-36" />
          </Field>
          {counts ? (
            <div className="rounded-md bg-sunken/60 px-3 py-2 text-[12.5px]" data-testid="assistance-standing-preview">
              <p className="font-medium text-ink">{t("aiWork.settings.previewTitle")}</p>
              <p className="text-ink-2">{t("aiWork.settings.previewCounts", counts)}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!preview ? <Button type="button" size="sm" variant="secondary" disabled={!weekdays.length || !time} loading={runPreview.isPending} onClick={() => runPreview.mutate()} data-testid="assistance-standing-preview-button">{t("aiWork.settings.previewTitle")}</Button> : <Button type="button" size="sm" loading={create.isPending} onClick={() => create.mutate(preview.digest)} data-testid="assistance-standing-confirm">{t("aiWork.settings.previewConfirm")}</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setPreview(undefined); }}>{t("common.action.cancel")}</Button>
          </div>
        </div>
      ) : null}
    </SettingsPanel>
  );
}

export function AssistanceSettingsSection() {
  const { t } = useLocale();
  const invalidate = useInvalidate();
  const settings = useAiSettings();
  const [draft, setDraft] = useState<Draft | undefined>();
  const [baseline, setBaseline] = useState<Draft | undefined>();
  const [reason, setReason] = useState("");
  const dirty = Boolean(draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline));
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    if (!settings.data || dirtyRef.current) return;
    const next = draftFrom(settings.data);
    setDraft(next);
    setBaseline(next);
  }, [settings.data]);
  const save = useApiMutation((api, value: Draft) => api.updateAiSettings({ tenantMode: value.tenantMode, externalProcessing: value.externalProcessing, capabilities: value.capabilities, expectedRevision: settings.data?.revision ?? 0, ...(reason.trim() ? { reason: reason.trim() } : {}) }), {
    successMessage: t("aiWork.settings.saved"),
    onSuccess: async (next) => {
      const fresh = draftFrom(next);
      setDraft(fresh);
      setBaseline(fresh);
      setReason("");
      await invalidate([qk.aiSettings]);
    },
  });
  if (settings.isLoading && !settings.data) return <Skeleton className="h-48 w-full" />;
  if (settings.isError || !settings.data || !draft) return <ErrorState title={t("aiWork.error.internal")} onRetry={() => void settings.refetch()} />;
  const data = settings.data;
  return (
    <SettingsSection title={t("aiWork.settings.title")} description={t("aiWork.settings.description")} testId="assistance-settings">
      <SettingsPanel>
        <ProviderStatus settings={data} />
        <p className="mt-1 text-[12px] text-ink-3">{t("aiWork.settings.usage", { runs: data.usage.monthRuns })}</p>
      </SettingsPanel>
      <SettingsPanel title={t("aiWork.settings.modeLabel")}>
        <RadioGroup value={draft.tenantMode} onValueChange={(value) => setDraft({ ...draft, tenantMode: value as AiTenantMode })} aria-label={t("aiWork.settings.modeLabel")} disabled={!data.canManage} className="grid gap-2 sm:grid-cols-3">
          {(["off", "prepare", "execute"] as const).map((mode) => (
            <RadioCard key={mode} value={mode} data-testid={`assistance-mode-${mode}`}>
              <span className="block text-[13px] font-medium text-ink">{t(`aiWork.settings.mode.${mode}`)}</span>
              <span className="mt-0.5 block text-[12px] leading-5 text-ink-3">{t(`aiWork.settings.modeHint.${mode}`)}</span>
            </RadioCard>
          ))}
        </RadioGroup>
      </SettingsPanel>
      <SettingsPanel title={t("aiWork.settings.capabilitiesTitle")} bodyClassName="divide-y divide-line py-1">
        {SHOWN_CAPABILITIES.map((key) => {
          const mode = draft.capabilities[key] ?? (PREPARE_ONLY_CAPABILITIES.has(key) ? "prepare" : "execute");
          return (
            <SettingsToggleRow
              key={key}
              label={t(`aiWork.settings.capability.${key}`)}
              checked={mode !== "off"}
              disabled={!data.canManage || draft.tenantMode === "off"}
              onCheckedChange={(checked) => setDraft({ ...draft, capabilities: { ...draft.capabilities, [key]: checked ? (PREPARE_ONLY_CAPABILITIES.has(key) ? "prepare" : "execute") : "off" } })}
            />
          );
        })}
      </SettingsPanel>
      <SettingsPanel>
        <SettingsToggleRow label={t("aiWork.settings.externalLabel")} hint={t("aiWork.settings.externalHint")} checked={draft.externalProcessing} disabled={!data.canManage} onCheckedChange={(checked) => setDraft({ ...draft, externalProcessing: checked })} />
        {dirty ? (
          <Field label={t("aiWork.settings.reasonLabel")} htmlFor="assistance-reason" className="mt-3">
            <Input id="assistance-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} dir="auto" />
          </Field>
        ) : null}
      </SettingsPanel>
      {data.tenantMode === "execute" ? <StandingInstructions /> : null}
      {data.canManage ? <SettingsSaveBar dirty={dirty} saving={save.isPending} onSave={async () => { await save.mutateAsync(draft); }} onDiscard={() => { if (baseline) setDraft(baseline); setReason(""); }} /> : null}
    </SettingsSection>
  );
}
