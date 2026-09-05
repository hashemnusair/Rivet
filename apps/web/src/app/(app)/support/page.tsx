"use client";

import { MessageSquareText, Plus, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState, StatePanel } from "@/components/ui/states";
import { getApi } from "@/lib/api/client";
import type { CreateSupportCaseInput, PlatformSaasPlan, PlatformSupportCase } from "@/lib/api/GymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

const PLAN_ORDER: PlatformSaasPlan["name"][] = ["Starter", "Growth", "Pro", "Enterprise"];
const STATUS_PRESENTATION: Record<PlatformSupportCase["status"], { label: string; variant: "neutral" | "warning" | "success" }> = {
  open: { label: "Open", variant: "neutral" },
  waiting: { label: "Waiting", variant: "warning" },
  resolved: { label: "Resolved", variant: "success" },
};
const NATIVE_SELECT = "h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13px]";

function CaseStatusBadge({ status }: { status: PlatformSupportCase["status"] }) {
  const presentation = STATUS_PRESENTATION[status] ?? { label: status.replaceAll("_", " "), variant: "neutral" as const };
  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}

export default function GymSupportPage() {
  const { session } = useApp();
  const { saasPlans } = useExperience();
  const [cases, setCases] = useState<PlatformSupportCase[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [retryToken, setRetryToken] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"general" | "plan_upgrade">("general");
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const selected = cases.find((supportCase) => supportCase.id === selectedId) ?? cases[0];

  useEffect(() => {
    setReplyBody("");
  }, [selected?.id]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const onError = (reason: unknown) => {
      if (cancelled) return;
      setError(reason instanceof Error ? reason.message : "Support cases could not be loaded.");
      setLoading(false);
    };
    void getApi().subscribeSupportCases((next) => {
      if (cancelled) return;
      setCases(next);
      setError(undefined);
      setLoading(false);
    }, onError).then((disposer) => { if (cancelled) disposer(); else unsubscribe = disposer; }).catch(onError);
    return () => { cancelled = true; unsubscribe?.(); };
  }, [retryToken]);

  const messages = selected?.messages ?? [];
  const creator = selected?.creatorName ?? selected?.creatorEmail;

  return <div className="space-y-5"><PageHeader title="RIVET support" description="Create a case and follow the real conversation with the platform team." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setCreateMode("plan_upgrade"); setCreateOpen(true); }}>Request plan upgrade</Button><Button onClick={() => { setCreateMode("general"); setCreateOpen(true); }}><Plus /> New case</Button></div>} />
    {error ? <ErrorState title="Support cases could not be loaded" description={error} onRetry={() => { setError(undefined); setLoading(true); setRetryToken((value) => value + 1); }} /> : null}
    <section className="panel grid min-h-[540px] overflow-hidden lg:grid-cols-[320px_1fr]">
      <aside className="border-b border-line lg:border-b-0 lg:border-e" aria-label="Your visible cases"><div className="border-b border-line px-4 py-3"><p className="context-label">Your visible cases</p></div>{loading ? <div className="space-y-3 p-4" role="status" aria-label="Loading support cases"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : cases.length === 0 ? <EmptyState title="No support cases yet" description="Any active staff member can create one." compact className="m-3 border-0" /> : <div className="divide-y divide-line">{cases.map((item) => <button key={item.id} type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)} className={cn("w-full px-4 py-3 text-start transition-colors hover:bg-sunken/60 cursor-pointer", selected?.id === item.id && "bg-sunken")}><div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-ink-3">{item.id}</span><CaseStatusBadge status={item.status} /></div><p className="mt-1.5 text-[13px] font-semibold">{item.subject}</p><p className="mt-0.5 text-[12px] text-ink-3">{item.priority === "urgent" ? "Urgent · " : ""}{formatDateTime(item.updatedAt ?? item.createdAt)}</p></button>)}</div>}</aside>
      {!selected ? <div className="flex items-center justify-center p-8 text-center"><div><MessageSquareText className="mx-auto size-6 text-ink-3" aria-hidden /><p className="mt-3 text-[13px] font-medium">Select a case or create a new one</p></div></div> : <article className="flex min-w-0 flex-col" aria-label={selected.subject}><header className="border-b border-line px-5 py-4"><div className="flex flex-wrap items-center gap-2">{selected.priority === "urgent" ? <Badge variant="signal">Urgent</Badge> : <Badge variant="outline">Normal</Badge>}<CaseStatusBadge status={selected.status} /><span className="font-mono text-[11px] text-ink-3">{selected.id}</span></div><h2 className="mt-2 text-[17px] font-semibold">{selected.subject}</h2><p className="mt-1 text-[12px] text-ink-3">{selected.createdAt ? `Created ${formatDateTime(selected.createdAt)}` : "Creation time not recorded"}{creator ? ` · by ${creator}` : ""}{selected.branchName ? ` · ${selected.branchName}` : ""}</p></header><div className="flex flex-1 flex-col gap-3 bg-paper/40 p-4 sm:p-5">{messages.length === 0 && !selected.body ? <StatePanel icon={MessageSquareText} title="No replies yet" description="The platform team sees this case as soon as it is created. Their replies and yours appear here." compact className="border-0 bg-transparent" /> : null}{messages.length === 0 && selected.body ? <div className="me-auto max-w-[82%] rounded-md border border-line bg-surface p-3.5"><div className="flex justify-between gap-5"><p className="text-[12px] font-semibold">{creator ?? "Your gym"}</p><span className="text-[12px] text-ink-3">{formatDateTime(selected.createdAt)}</span></div><p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{selected.body}</p></div> : null}{messages.map((message) => <div key={message.id} className={cn("max-w-[82%] rounded-md border p-3.5", message.authorType === "gym" ? "me-auto border-line bg-surface" : "ms-auto border-line-2 bg-sunken")}><div className="flex justify-between gap-5"><p className="text-[12px] font-semibold">{message.authorName}</p><time className="text-[12px] text-ink-3">{formatDateTime(message.createdAt)}</time></div><p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{message.body}</p></div>)}{selected.resolutionSummary ? <div className="rounded-md border border-success/25 bg-success-bg p-3.5"><p className="context-label text-success-deep">Resolution</p><p className="mt-1.5 text-[13px] text-ink-2">{selected.resolutionSummary}</p></div> : null}</div>{selected.status === "resolved" ? <div className="border-t border-line bg-surface px-5 py-4 text-[12.5px] text-ink-3">This case is resolved. Create a new case if you need help with a different issue.</div> : <form className="border-t border-line bg-surface p-4" onSubmit={(event) => { event.preventDefault(); if (!replyBody.trim() || replying) return; setReplying(true); void getApi().replyToSupportCase(selected.id, replyBody.trim()).then((updated) => { setCases((current) => current.map((item) => item.id === updated.id ? updated : item)); setReplyBody(""); toast.success("Reply sent to RIVET support."); }).catch((reason) => toast.error(reason instanceof Error ? reason.message : "The reply could not be sent.")).finally(() => setReplying(false)); }}><Field label="Reply to support"><Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Add details or answer the platform team's question…" className="min-h-20" /></Field><div className="mt-3 flex justify-end"><Button type="submit" loading={replying} disabled={!replyBody.trim()}><Send /> Send reply</Button></div></form>}</article>}
    </section>
    <CreateSupportDialog open={createOpen} mode={createMode} currentPlan={session?.workspace?.entitlements.subscriptionPlan} plans={saasPlans} onOpenChange={setCreateOpen} email={session?.user.email ?? ""} branches={session?.branches ?? []} onCreated={(supportCase) => { setSelectedId(supportCase.id); setCreateOpen(false); }} />
  </div>;
}

function CreateSupportDialog({ open, mode, currentPlan, plans, onOpenChange, email, branches, onCreated }: { open: boolean; mode: "general" | "plan_upgrade"; currentPlan?: PlatformSaasPlan["name"]; plans: PlatformSaasPlan[]; onOpenChange: (open: boolean) => void; email: string; branches: Array<{ id: string; name: string }>; onCreated: (supportCase: PlatformSupportCase) => void }) {
  const [contactEmail, setContactEmail] = useState(email);
  const [branchId, setBranchId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<CreateSupportCaseInput["priority"]>("normal");
  const [requestedPlan, setRequestedPlan] = useState<PlatformSaasPlan["name"]>("Growth");
  const [billingInterval, setBillingInterval] = useState<NonNullable<CreateSupportCaseInput["billingInterval"]>>("monthly");
  const [saving, setSaving] = useState(false);
  const currentPlanIndex = currentPlan ? PLAN_ORDER.indexOf(currentPlan) : -1;
  const availablePlans = plans.filter((plan) => PLAN_ORDER.indexOf(plan.name) > currentPlanIndex);
  const canSubmit = Boolean(contactEmail.trim() && subject.trim() && body.trim() && (mode !== "plan_upgrade" || (requestedPlan && availablePlans.length > 0)));
  useEffect(() => {
    if (mode !== "plan_upgrade") return;
    const firstAvailable = availablePlans[0]?.name;
    if (firstAvailable && !availablePlans.some((plan) => plan.name === requestedPlan)) setRequestedPlan(firstAvailable);
  }, [mode, availablePlans, requestedPlan]);
  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const created = await getApi().createSupportCase({ email: contactEmail.trim(), branchId: branchId || undefined, subject: subject.trim(), body: body.trim(), priority, requestType: mode, requestedPlan: mode === "plan_upgrade" ? requestedPlan : undefined, billingInterval: mode === "plan_upgrade" ? billingInterval : undefined });
      setSubject(""); setBody(""); setBranchId(""); setPriority("normal"); setRequestedPlan("Growth"); setBillingInterval("monthly");
      onCreated(created);
      toast.success("Support case created.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "The support case could not be created."); } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{mode === "plan_upgrade" ? "Request a plan upgrade" : "Create a support case"}</DialogTitle><DialogDescription>{mode === "plan_upgrade" ? "Send the platform team a plan request. Your gym will not be upgraded automatically; an administrator reviews the request and applies any approved change from the gym detail page." : "The RIVET platform team and your authorized gym managers can follow this persisted conversation."}</DialogDescription></DialogHeader><DialogBody className="grid gap-4"><Field label="Contact email"><Input type="email" inputMode="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></Field><Field label="Related branch (optional)"><select className={NATIVE_SELECT} value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Whole gym</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>{mode === "plan_upgrade" ? <><Field label="Requested plan"><select className={NATIVE_SELECT} value={requestedPlan} onChange={(event) => setRequestedPlan(event.target.value as PlatformSaasPlan["name"])}>{availablePlans.map((plan) => <option key={plan.name} value={plan.name}>{plan.name} · JOD {(plan.priceMinor / 1000).toFixed(3)}/mo</option>)}</select></Field><Field label="Billing cadence"><select className={NATIVE_SELECT} value={billingInterval} onChange={(event) => setBillingInterval(event.target.value as NonNullable<CreateSupportCaseInput["billingInterval"]>)}><option value="monthly">Monthly</option><option value="annual">Annual · save 20%</option></select></Field></> : <Field label="Priority"><select className={NATIVE_SELECT} value={priority} onChange={(event) => setPriority(event.target.value as CreateSupportCaseInput["priority"])}><option value="normal">Normal</option><option value="urgent">Urgent — operations blocked</option></select></Field>}<Field label="Subject"><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={mode === "plan_upgrade" ? `Request ${requestedPlan} plan upgrade` : undefined} /></Field><Field label={mode === "plan_upgrade" ? "Why do you need this plan?" : "What happened?"}><Textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-32" /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} disabled={!canSubmit} onClick={() => void submit()}><Send /> {mode === "plan_upgrade" ? "Send request" : "Send case"}</Button></DialogFooter></DialogContent></Dialog>;
}

function formatDateTime(value?: string) { if (!value) return "Not recorded"; const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : value; }
