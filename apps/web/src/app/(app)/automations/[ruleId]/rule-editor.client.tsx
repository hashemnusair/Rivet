"use client";

import { MessageSquareText, Save } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { AutomationAction, AutomationActionKey, MessageTemplate } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/utils/dates";
import { Breadcrumbs, PageHeader } from "@/components/shared/chrome";
import { DateTimeText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState, NotFoundState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";
import { ACTION_LABELS, TRIGGER_LABELS } from "@/features/automations/labels";

export default function RuleEditorPageClient() {
  const { ruleId } = useParams<{ ruleId: string }>();
  const invalidate = useInvalidate();

  const ruleQuery = useApiQuery(qk.automationRule(ruleId), (api) => api.getAutomationRule(ruleId));
  const templatesQuery = useApiQuery(qk.templates, (api) => api.listMessageTemplates());
  const executionsQuery = useApiQuery(qk.automationExecutions({ ruleId }), (api) =>
    api.listAutomationExecutions({ ruleId, pageSize: 10 }),
  );

  const [name, setName] = useState("");
  const [daysBefore, setDaysBefore] = useState("14, 3");
  const [paramValue, setParamValue] = useState("21");
  const [dedupe, setDedupe] = useState(72);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [dirty, setDirty] = useState(false);

  const rule = ruleQuery.data;

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      const dp = rule.triggerParams.daysBefore;
      setDaysBefore(Array.isArray(dp) ? dp.join(", ") : String(dp ?? "14, 3"));
      const pv = rule.triggerParams.days ?? rule.triggerParams.hours ?? rule.triggerParams.daysAfter ?? 21;
      setParamValue(String(pv));
      setDedupe(rule.dedupeWindowHours);
      setActions(rule.actions);
      setDirty(false);
    }
  }, [rule]);

  const save = useApiMutation(
    (api) => {
      if (!rule) throw new Error("no rule");
      const triggerParams: Record<string, number | number[]> =
        rule.trigger === "membership_expiring"
          ? { daysBefore: daysBefore.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0) }
          : rule.trigger === "member_inactive" || rule.trigger === "payment_outstanding"
            ? { days: Number(paramValue) }
            : { hours: Number(paramValue) };
      return api.updateAutomationRule(rule.id, {
        name,
        triggerParams,
        actions,
        dedupeWindowHours: dedupe,
      });
    },
    {
      onSuccess: async () => {
        toast.success("Rule saved — changes are audited.");
        setDirty(false);
        await invalidate();
      },
    },
  );

  const toggle = useApiMutation(
    (api, enabled: boolean) => api.updateAutomationRule(ruleId, { enabled }),
    {
      onSuccess: async (_d, enabled) => {
        toast.success(enabled ? "Rule enabled." : "Rule paused.");
        await invalidate();
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
    return isApiError(ruleQuery.error) && ruleQuery.error.code === "NOT_FOUND" ? <NotFoundState title="Rule not found" /> : <ErrorState onRetry={() => ruleQuery.refetch()} />;
  }
  if (!rule) return null;

  const paramLabel =
    rule.trigger === "membership_expiring"
      ? "Days before expiry (comma separated)"
      : rule.trigger === "member_inactive"
        ? "Days without a check-in"
        : rule.trigger === "payment_outstanding"
          ? "Days outstanding"
          : rule.trigger === "lead_untouched"
            ? "Hours without first contact"
            : "Hours overdue";

  const selectedTemplate = templatesQuery.data?.find((t) => t.id === actions.find((a) => a.key === "queue_message")?.templateId);

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Automations", href: "/automations" }, { label: rule.name }]} />
      <PageHeader
        eyebrow="System · Automations"
        title={rule.name}
        description={`Trigger: ${TRIGGER_LABELS[rule.trigger]}. Last run ${rule.lastRunAt ? formatDateTime(rule.lastRunAt) : "never"} · ${rule.executionsLast30Days} executions in 30 days.`}
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]">
              <span className={rule.enabled ? "text-success-deep font-medium" : "text-ink-3"}>{rule.enabled ? "Enabled" : "Paused"}</span>
              <Switch checked={rule.enabled} onCheckedChange={(v) => toggle.mutate(v)} aria-label="Enable rule" />
            </label>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
              <Save /> Save changes
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Editor */}
        <section className="panel self-start p-5">
          <h2 className="mb-4 font-display text-[15px] font-semibold">Configuration</h2>
          <div className="space-y-4">
            <Field label="Rule name">
              <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
            </Field>

            <Field label={paramLabel}>
              {rule.trigger === "membership_expiring" ? (
                <Input value={daysBefore} onChange={(e) => { setDaysBefore(e.target.value); setDirty(true); }} className="tabular" />
              ) : (
                <Input type="number" min={1} value={paramValue} onChange={(e) => { setParamValue(e.target.value); setDirty(true); }} className="tabular" />
              )}
            </Field>

            <Field label="Actions" hint="What happens when the trigger fires.">
              <div className="space-y-2">
                {(["create_task", "queue_message", "notify_manager"] as AutomationActionKey[]).map((key) => {
                  const active = actions.some((a) => a.key === key);
                  return (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
                      <span className="text-[13px]">{ACTION_LABELS[key]}</span>
                      <div className="flex items-center gap-2">
                        {key === "queue_message" && active ? (
                          <Select
                            value={actions.find((a) => a.key === "queue_message")?.templateId ?? ""}
                            onValueChange={(v) => {
                              setActions((prev) => prev.map((a) => (a.key === "queue_message" ? { ...a, templateId: v } : a)));
                              setDirty(true);
                            }}
                          >
                            <SelectTrigger sizeVariant="sm" className="w-44" aria-label="Message template">
                              <SelectValue placeholder="Template…" />
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
                          onCheckedChange={(v) => {
                            setActions((prev) =>
                              v
                                ? [...prev, key === "queue_message" ? { key, templateId: templatesQuery.data?.[0]?.id, channel: "whatsapp" as const } : { key }]
                                : prev.filter((a) => a.key !== key),
                            );
                            setDirty(true);
                          }}
                          aria-label={ACTION_LABELS[key]}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Field>

            <Field label="Deduplication window (hours)" hint="The same member won't be hit twice within this window.">
              <Input type="number" min={1} value={dedupe} onChange={(e) => { setDedupe(Number(e.target.value)); setDirty(true); }} className="font-mono w-32" />
            </Field>
          </div>
        </section>

        <div className="space-y-5 self-start">
          {/* Template preview */}
          <section className="panel overflow-hidden">
            <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <MessageSquareText className="size-4 text-ink-3" aria-hidden />
              <h2 className="text-[13px] font-semibold">Message preview{selectedTemplate ? ` — ${selectedTemplate.name}` : ""}</h2>
              <Badge variant="outline" className="ms-auto">sandbox</Badge>
            </header>
            {selectedTemplate ? (
              <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <TemplateBubble label="English" body={renderTemplate(selectedTemplate, "en")} />
                <TemplateBubble label="العربية" body={renderTemplate(selectedTemplate, "ar")} rtl />
              </div>
            ) : (
              <p className="px-4 py-6 text-[13px] text-ink-3">Enable “Queue message” and pick a template to preview it.</p>
            )}
          </section>

          {/* Recent executions */}
          <section className="panel overflow-hidden">
            <header className="border-b border-line px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">Recent executions</h2>
            </header>
            {executionsQuery.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (executionsQuery.data?.items.length ?? 0) === 0 ? (
              <p className="px-4 py-6 text-[13px] text-ink-3">No executions for this rule yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {executionsQuery.data!.items.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium">{e.subjectName}</p>
                      <p className="truncate text-[11.5px] text-ink-3">{e.detail}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={e.status === "success" ? "success" : e.status === "failed" ? "signal" : "neutral"}>
                        {e.status === "skipped_duplicate" ? "skipped" : e.status}
                      </Badge>
                      <span className="text-[11px] text-ink-3 whitespace-nowrap">
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
  return (
    <div className="p-4">
      <p className="eyebrow mb-2">{label}</p>
      <div
        dir={rtl ? "rtl" : "ltr"}
        className={cn(
          "rounded-lg rounded-ts-sm border border-line bg-sunken/60 px-3 py-2.5 text-[12.5px] leading-relaxed",
          rtl && "font-['var(--font-plex-arabic)']",
        )}
      >
        {body}
      </div>
      <p className="mt-1.5 font-mono text-[10px] text-ink-4" dir="ltr">
        WhatsApp · sandbox provider · sample variables
      </p>
    </div>
  );
}
