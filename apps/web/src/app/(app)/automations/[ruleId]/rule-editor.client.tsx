"use client";
import { useT } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

import { MessageSquareText, Play, Save } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { AutomationAction, AutomationActionKey, MessageTemplate } from "@/lib/domain/types";
import { Breadcrumbs, PageHeader } from "@/components/shared/chrome";
import { DateTimeText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState, ForbiddenState, NotFoundState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { isApiError } from "@/lib/api/errors";
import { usePermissions } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { ACTION_LABEL_KEYS, TRIGGER_LABEL_KEYS } from "@/features/automations/labels";
import { automationTriggerFieldValue, automationTriggerParameterLabel, automationTriggerParams, hasValidAutomationTriggerParams, parseAutomationInteger } from "@/features/automations/form";
import { automationExecutionLabel } from "@/features/automations/monitoring-ui";

export default function RuleEditorPageClient() {
  const t = useT();
  const format = useFormat();
  const { can } = usePermissions();
  const canManage = can("automations.manage");
  const { ruleId } = useParams<{ ruleId: string }>();
  const invalidate = useInvalidate();

  const ruleQuery = useApiQuery(qk.automationRule(ruleId), (api) => api.getAutomationRule(ruleId));
  const templatesQuery = useApiQuery(qk.templates, (api) => api.listMessageTemplates());
  const executionInput = { ruleId, pageSize: 10 };
  const executionsQuery = useRealtimeApiQuery({ queryKey: qk.automationExecutions({ ruleId }), query: (api) => api.listAutomationExecutions(executionInput), subscribe: (api, onValue, onError) => api.subscribeAutomationExecutions(executionInput, onValue, onError) });
  const runPreviewQuery = useApiQuery(qk.automationRunPreview(ruleId), (api) => api.previewAutomationRun(ruleId));

  const [name, setName] = useState("");
  const [daysBefore, setDaysBefore] = useState("14, 3");
  const [paramValue, setParamValue] = useState("21");
  const [dedupe, setDedupe] = useState("72");
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [dirty, setDirty] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [runReason, setRunReason] = useState("");

  const rule = ruleQuery.data;

  useEffect(() => {
    if (rule) {
      if (!dirty) {
        setName(rule.name);
        const dp = rule.triggerParams.daysBefore;
        setDaysBefore(Array.isArray(dp) ? dp.join(", ") : "14, 3");
        setParamValue(automationTriggerFieldValue(rule.trigger, rule.triggerParams));
        setDedupe(String(rule.dedupeWindowHours));
        setActions(rule.actions);
        setDirty(false);
      }
    }
  }, [rule, dirty]);

  const save = useApiMutation(
    (api) => {
      if (!rule) throw new Error("no rule");
      const rawTriggerValue = rule.trigger === "membership_expiring" ? daysBefore : paramValue;
      if (!hasValidAutomationTriggerParams(rule.trigger, rawTriggerValue)) throw new Error(t("staffTools.automations.editor.validationNumber"));
      const dedupeHours = parseAutomationInteger(dedupe);
      if (dedupeHours === undefined) throw new Error(t("staffTools.automations.editor.validationDedupe"));
      const triggerParams = automationTriggerParams(rule.trigger, rawTriggerValue);
      return api.updateAutomationRule(rule.id, {
        name,
        triggerParams,
        actions,
        dedupeWindowHours: dedupeHours,
      });
    },
    {
      onSuccess: async () => {
        toast.success(t("staffTools.automations.editor.saved"));
        setDirty(false);
        await invalidate();
      },
    },
  );

  const toggle = useApiMutation(
    (api, enabled: boolean) => api.updateAutomationRule(ruleId, { enabled }),
    {
      onSuccess: async (_d, enabled) => {
        toast.success(enabled ? t("staffTools.automations.editor.turnedOn") : t("staffTools.automations.editor.turnedOff"));
        await invalidate();
      },
    },
  );

  const runNow = useApiMutation(
    (api) => api.runAutomationRuleNow(ruleId, runReason.trim()),
    {
      onSuccess: async (result) => {
        toast.success(`${t("staffTools.automations.editor.runFor", { count: result.created, displayCount: format.number(result.created) })} ${t("staffTools.automations.editor.skippedDuplicates", { count: result.skippedDuplicates, displayCount: format.number(result.skippedDuplicates) })}`);
        setRunOpen(false);
        setRunReason("");
        await invalidate([qk.automationRules, ["automationExecutions"]]);
      },
    },
  );

  if (ruleQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (ruleQuery.isError) {
    if (isApiError(ruleQuery.error) && ruleQuery.error.code === "NOT_FOUND") return <NotFoundState title={t("staffTools.automations.editor.notFound")} />;
    if (isApiError(ruleQuery.error) && ruleQuery.error.code === "FORBIDDEN") return <ForbiddenState description={t("staffTools.automations.editor.forbidden")} />;
    return <ErrorState onRetry={() => ruleQuery.refetch()} />;
  }
  if (!rule) return null;

  const paramLabel = automationTriggerParameterLabel(rule.trigger, t);

  const selectedTemplate = templatesQuery.data?.find((t) => t.id === actions.find((a) => a.key === "queue_message")?.templateId);
  const queueMessageAction = actions.find((action) => action.key === "queue_message");
  const validTriggerParams = hasValidAutomationTriggerParams(rule.trigger, rule.trigger === "membership_expiring" ? daysBefore : paramValue);
  const dedupeHours = parseAutomationInteger(dedupe);
  const triggerKey = TRIGGER_LABEL_KEYS[rule.trigger];
  const ruleDescription = t("staffTools.automations.editor.description", {
    trigger: triggerKey ? t(triggerKey) : String(rule.trigger),
    lastRun: rule.lastRunAt ? format.dateTime(rule.lastRunAt) : t("staffTools.automations.editor.lastRunNever"),
    runCount: t("staffTools.automations.editor.runCount", { count: rule.executionsLast30Days, displayCount: format.number(rule.executionsLast30Days) }),
  });
  const canSave = canManage && dirty && name.trim().length > 0 && actions.length > 0 && validTriggerParams && dedupeHours !== undefined && (!queueMessageAction || Boolean(queueMessageAction.templateId));
  const invalidTrigger = !validTriggerParams;
  const invalidDedupe = dedupeHours === undefined;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: t("staffTools.automations.history"), href: "/audit?category=automations" }, { label: rule.name }]} />
      <PageHeader
        sectionLabel={t("staffTools.automations.editor.sectionLabel")}
        title={rule.name}
        description={ruleDescription}
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]">
              <span className={rule.enabled ? "text-success-deep font-medium" : "text-ink-3"}>{rule.enabled ? t("staffTools.automations.editor.enabled") : t("staffTools.automations.editor.disabled")}</span>
              <Switch checked={rule.enabled} onCheckedChange={(v) => toggle.mutate(v)} disabled={!canManage || toggle.isPending} aria-label={t("staffTools.automations.editor.toggleAria")} />
            </label>
            <Button variant="secondary" onClick={() => setRunOpen(true)} disabled={!canManage || dirty} title={dirty ? t("staffTools.automations.editor.saveFirst") : !canManage ? t("staffTools.automations.editor.permission") : undefined}>
              <Play />{t("staffTools.automations.editor.runNow")}
            </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canSave || save.isPending}>
              <Save />{" "}{t("common.action.saveChanges")}</Button>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Editor */}
        <section className="panel self-start p-5">
          <h2 className="mb-4 font-display text-[15px] font-semibold">{t("staffTools.automations.editor.settings")}</h2>
          {!canManage ? <p role="status" className="mb-4 text-[12px] text-warning-deep">{t("staffTools.automations.editor.permission")}</p> : null}
          <div className="space-y-4">
            <Field label={t("common.label.name")}>
              <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} disabled={!canManage} />
            </Field>

            <Field label={paramLabel} hint={rule.trigger === "membership_expired" ? t("staffTools.automations.editor.zeroForToday") : undefined}>
              {rule.trigger === "membership_expiring" ? (
                <Input aria-label={paramLabel} value={daysBefore} onChange={(e) => { setDaysBefore(e.target.value); setDirty(true); }} disabled={!canManage} aria-invalid={invalidTrigger} inputMode="numeric" className="tabular" />
              ) : (
                <Input aria-label={paramLabel} type="text" inputMode="numeric" value={paramValue} onChange={(e) => { setParamValue(e.target.value); setDirty(true); }} disabled={!canManage} aria-invalid={invalidTrigger} className="tabular" />
              )}
              {invalidTrigger ? <p role="alert" className="text-[12px] text-danger">{t("staffTools.automations.editor.validationNumber")}</p> : null}
            </Field>

            <Field label={t("staffTools.automations.editor.whatItDoesLabel")} hint={t("staffTools.automations.editor.chooseAtLeastOne")}>
              <div className="space-y-2">
                {(["create_task", "queue_message", "notify_manager"] as AutomationActionKey[]).map((key) => {
                  const active = actions.some((a) => a.key === key);
                  return (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
                      <span className="text-[13px]">{t(ACTION_LABEL_KEYS[key])}</span>
                      <div className="flex items-center gap-2">
                        {key === "queue_message" && active ? (
                          <Select
                            value={actions.find((a) => a.key === "queue_message")?.templateId ?? ""}
                            disabled={!canManage || templatesQuery.isLoading || templatesQuery.isError}
                            onValueChange={(v) => {
                              setActions((prev) => prev.map((a) => (a.key === "queue_message" ? { ...a, templateId: v } : a)));
                              setDirty(true);
                            }}
                          >
                            <SelectTrigger sizeVariant="sm" className="w-44" aria-label={t("staffTools.automations.editor.messageTemplate")}>
                              <SelectValue placeholder={t("staffTools.automations.editor.chooseMessage")} />
                            </SelectTrigger>
                            <SelectContent>
                              {(templatesQuery.data ?? []).map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                        <Switch
                          checked={active}
                          disabled={!canManage || (key === "queue_message" && templatesQuery.isError)}
                          onCheckedChange={(v) => {
                            setActions((prev) =>
                              v
                                ? [...prev, key === "queue_message" ? { key, templateId: templatesQuery.data?.[0]?.id, channel: "whatsapp" as const } : { key }]
                                : prev.filter((a) => a.key !== key),
                            );
                            setDirty(true);
                          }}
                          aria-label={t(ACTION_LABEL_KEYS[key])}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Field>

            <Field label={t("staffTools.automations.editor.waitRepeat")} hint={t("staffTools.automations.editor.dedupeHint")}>
              <Input aria-label={t("staffTools.automations.editor.waitRepeat")} type="text" inputMode="numeric" min={1} value={dedupe} onChange={(e) => { setDedupe(e.target.value); setDirty(true); }} disabled={!canManage} aria-invalid={invalidDedupe} className="font-mono w-32" />
              {invalidDedupe ? <p role="alert" className="text-[12px] text-danger">{t("staffTools.automations.editor.validationDedupe")}</p> : null}
            </Field>
            {templatesQuery.isError && actions.some((action) => action.key === "queue_message") ? <ErrorState onRetry={() => { void templatesQuery.refetch(); }} /> : null}
          </div>
        </section>

        <div className="space-y-5 self-start">
          {/* Template preview */}
          <section className="panel overflow-hidden">
            <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <MessageSquareText className="size-4 text-ink-3" aria-hidden />
              <h2 className="text-[13px] font-semibold">{t("staffTools.automations.editor.messagePreview")}{selectedTemplate ? ` — ${selectedTemplate.name}` : ""}</h2>
              <Badge variant="outline" className="ms-auto">{t("staffTools.automations.editor.sample")}</Badge>
            </header>
            {selectedTemplate ? (
              <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <TemplateBubble label={t("common.language.english")} body={renderTemplate(selectedTemplate, "en")} />
                <TemplateBubble label={t("common.language.arabic")} body={renderTemplate(selectedTemplate, "ar")} rtl />
              </div>
            ) : (
              <p className="px-4 py-6 text-[13px] text-ink-3">{t("staffTools.automations.editor.turnOnAndChoose", { action: t(ACTION_LABEL_KEYS.queue_message) })}</p>
            )}
          </section>

          <section className="panel overflow-hidden">
            <header className="border-b border-line px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">{t("staffTools.automations.editor.recentRuns")}</h2>
            </header>
            {executionsQuery.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-32 w-full" />
              </div>
            ) : executionsQuery.isError ? (
              <div className="p-4"><ErrorState onRetry={() => { void executionsQuery.refetch(); }} /></div>
            ) : (executionsQuery.data?.items.length ?? 0) === 0 ? (
              <p className="px-4 py-6 text-[13px] text-ink-3">{t("staffTools.automations.editor.notRunYet")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {executionsQuery.data!.items.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium">{e.subjectName}</p>
                      <p className="truncate text-[12px] text-ink-3">{e.detail}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={e.status === "success" ? "success" : e.status === "failed" ? "signal" : "neutral"}>
                        {automationExecutionLabel(e.status)}
                      </Badge>
                      <span className="text-[12px] text-ink-3 whitespace-nowrap">
                        <DateTimeText iso={e.executedAt} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("staffTools.automations.editor.runDialogTitle")}</DialogTitle>
            <DialogDescription>{t("staffTools.automations.editor.runDialogDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {runPreviewQuery.isLoading ? <Skeleton className="h-24 w-full" /> : runPreviewQuery.isError ? <ErrorState onRetry={() => runPreviewQuery.refetch()} /> : (
              <div className="rounded-md border border-line bg-sunken/40 p-3">
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div><p className="context-label">{t("staffTools.automations.editor.willRunFor")}</p><p className="mt-1 text-[18px] tabular">{format.number(runPreviewQuery.data?.eligibleCount ?? 0)}</p></div>
                  <div><p className="context-label">{t("staffTools.automations.editor.skippedAlreadyDone")}</p><p className="mt-1 text-[18px] tabular">{format.number(runPreviewQuery.data?.duplicateCount ?? 0)}</p></div>
                </div>
                {(runPreviewQuery.data?.candidates.length ?? 0) > 0 ? <ul className="mt-3 max-h-36 divide-y divide-line overflow-y-auto border-t border-line text-[12px]">{runPreviewQuery.data!.candidates.map((candidate) => <li key={`${candidate.subjectType}:${candidate.subjectId}`} className="flex items-center justify-between gap-3 py-2"><span className="truncate">{candidate.subjectName}</span><Badge variant={candidate.duplicate ? "neutral" : "success"}>{candidate.duplicate ? t("staffTools.automations.editor.candidateAlreadyDone") : t("staffTools.automations.editor.candidateWillRun")}</Badge></li>)}</ul> : <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-3">{t("staffTools.automations.editor.nobodyMatches")}</p>}
              </div>
            )}
            <Field label={t("common.label.reason")} required>
              <Textarea value={runReason} onChange={(event) => setRunReason(event.target.value)} placeholder={t("staffTools.automations.editor.whyNow")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRunOpen(false)}>{t("common.action.cancel")}</Button>
            <Button onClick={() => runNow.mutate()} loading={runNow.isPending} disabled={!canManage || runNow.isPending || !runReason.trim() || runPreviewQuery.isLoading || runPreviewQuery.isError}><Play /> {t("staffTools.automations.editor.runNow")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function renderTemplate(template: MessageTemplate, lang: "en" | "ar"): string {
  const sample: Record<string, string> = {
    member_name: lang === "ar" ? "ليان" : "Layan",
    end_date: "2026-08-12",
    branch_name: lang === "ar" ? "عبدون" : "Abdoun",
    gym_name: "Forge",
    amount: "25.000",
  };
  const body = lang === "ar" ? template.bodyAr : template.bodyEn;
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => sample[key] ?? `{{${key}}}`);
}

function TemplateBubble({ label, body, rtl }: { label: string; body: string; rtl?: boolean }) {
  const t = useT();
  return (
    <div className="p-4">
      <p className="context-label mb-2">{label}</p>
      <div
        dir={rtl ? "rtl" : "ltr"}
        className={cn(
          "rounded-lg rounded-ts-sm border border-line bg-sunken/60 px-3 py-2.5 text-[12.5px] leading-relaxed",
          rtl && "font-['var(--font-plex-arabic)']",
        )}
      >
        {body}
      </div>
      <p className="mt-1.5 font-mono text-[10.5px] text-ink-4" dir="ltr">
        {t("staffTools.automations.editor.channelWhatsapp")} · {t("staffTools.automations.editor.sampleMessage")}
      </p>
    </div>
  );
}
