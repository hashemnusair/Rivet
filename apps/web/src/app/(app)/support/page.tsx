"use client";

import { MessageSquareText, Plus, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { getApi } from "@/lib/api/client";
import type { CreateSupportCaseInput, PlatformSaasPlan, PlatformSupportCase } from "@/lib/api/GymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

const PLAN_ORDER: PlatformSaasPlan["name"][] = ["Starter", "Growth", "Pro", "Enterprise"];

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

  return <div className="space-y-5"><PageHeader eyebrow="System" title="RIVET support" description="Create a case and follow the real conversation with the platform team." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setCreateMode("plan_upgrade"); setCreateOpen(true); }}>Request plan upgrade</Button><Button onClick={() => { setCreateMode("general"); setCreateOpen(true); }}><Plus /> New case</Button></div>} />
    {error ? <ErrorState title="Support cases could not be loaded" description={error} onRetry={() => { setError(undefined); setLoading(true); setRetryToken((value) => value + 1); }} /> : null}
    <section className="grid min-h-[540px] overflow-hidden border border-line bg-surface lg:grid-cols-[320px_1fr]">
      <aside className="border-b border-line lg:border-b-0 lg:border-e"><div className="border-b border-line px-4 py-3"><p className="eyebrow">Your visible cases</p></div>{loading ? <div className="space-y-3 p-4" role="status" aria-label="Loading support cases"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : cases.length === 0 ? <EmptyState title="No support cases yet" description="Any active staff member can create one." compact className="m-3 border-0" /> : <div className="divide-y divide-line">{cases.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={cn("w-full p-4 text-start hover:bg-sunken", selected?.id === item.id && "bg-sunken shadow-[inset_3px_0_0_#d9232b]")}><div className="flex items-center justify-between gap-2"><span className="font-mono text-[8px] text-ink-3">{item.id}</span><span className="rounded-full bg-sunken px-2 py-1 font-mono text-[7px] uppercase text-ink-3">{item.status}</span></div><p className="mt-2 text-[12px] font-semibold">{item.subject}</p><p className="mt-1 text-[9.5px] text-ink-3">{formatDateTime(item.updatedAt ?? item.createdAt)}</p></button>)}</div>}</aside>
      {!selected ? <div className="flex items-center justify-center p-8 text-center"><div><MessageSquareText className="mx-auto size-6 text-ink-3" /><p className="mt-3 text-[13px] font-medium">Select a case or create a new one</p></div></div> : <article className="flex min-w-0 flex-col"><header className="border-b border-line p-5"><div className="flex flex-wrap items-center gap-2"><span className={selected.priority === "urgent" ? "rounded-full bg-danger-bg px-2 py-1 font-mono text-[7px] uppercase text-danger" : "rounded-full bg-info-bg px-2 py-1 font-mono text-[7px] uppercase text-info"}>{selected.priority}</span><span className="font-mono text-[8px] text-ink-3">{selected.status}</span></div><h2 className="mt-3 text-[19px] font-semibold">{selected.subject}</h2><p className="mt-1 text-[10.5px] text-ink-3">Created by {selected.creatorName ?? selected.creatorEmail} · {formatDateTime(selected.createdAt)}</p></header><div className="flex flex-1 flex-col gap-4 bg-paper/30 p-5">{(selected.messages ?? []).map((message) => <div key={message.id} className={cn("max-w-[82%] border p-4", message.authorType === "gym" ? "me-auto border-line bg-surface" : "ms-auto border-info/20 bg-info-bg")}><div className="flex justify-between gap-5"><p className="text-[10.5px] font-semibold">{message.authorName}</p><time className="font-mono text-[8px] text-ink-3">{formatDateTime(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-2">{message.body}</p></div>)}{selected.resolutionSummary ? <div className="border border-success/25 bg-success-bg p-4"><p className="eyebrow text-success">Resolution</p><p className="mt-2 text-[12px] text-ink-2">{selected.resolutionSummary}</p></div> : null}</div>{selected.status === "resolved" ? <div className="border-t border-line bg-surface px-5 py-4 text-[12px] text-ink-3">This case is resolved. Create a new case if you need help with a different issue.</div> : <form className="border-t border-line bg-surface p-4" onSubmit={(event) => { event.preventDefault(); if (!replyBody.trim() || replying) return; setReplying(true); void getApi().replyToSupportCase(selected.id, replyBody.trim()).then((updated) => { setCases((current) => current.map((item) => item.id === updated.id ? updated : item)); setReplyBody(""); toast.success("Reply sent to RIVET support."); }).catch((reason) => toast.error(reason instanceof Error ? reason.message : "The reply could not be sent.")).finally(() => setReplying(false)); }}><label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>Reply to support</span><Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Add details or answer the platform team's question…" className="min-h-20" /></label><div className="mt-3 flex justify-end"><Button type="submit" loading={replying} disabled={!replyBody.trim()}><Send /> Send reply</Button></div></form>}</article>}
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
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{mode === "plan_upgrade" ? "Request a plan upgrade" : "Create a support case"}</DialogTitle><DialogDescription>{mode === "plan_upgrade" ? "Send the platform team a plan request. Your gym will not be upgraded automatically; an administrator reviews the request and applies any approved change from the gym detail page." : "The RIVET platform team and your authorized gym managers can follow this persisted conversation."}</DialogDescription></DialogHeader><DialogBody className="grid gap-4"><label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>Contact email</span><Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></label><label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>Related branch (optional)</span><select className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Whole gym</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>{mode === "plan_upgrade" ? <><label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>Requested plan</span><select className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={requestedPlan} onChange={(event) => setRequestedPlan(event.target.value as PlatformSaasPlan["name"])}>{availablePlans.map((plan) => <option key={plan.name} value={plan.name}>{plan.name} · JOD {(plan.priceMinor / 1000).toFixed(3)}/mo</option>)}</select></label><label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>Billing cadence</span><select className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={billingInterval} onChange={(event) => setBillingInterval(event.target.value as NonNullable<CreateSupportCaseInput["billingInterval"]>)}><option value="monthly">Monthly</option><option value="annual">Annual · save 20%</option></select></label></> : <label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>Priority</span><select className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={priority} onChange={(event) => setPriority(event.target.value as CreateSupportCaseInput["priority"])}><option value="normal">Normal</option><option value="urgent">Urgent — operations blocked</option></select></label>}<label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>{mode === "plan_upgrade" ? "Subject" : "Subject"}</span><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={mode === "plan_upgrade" ? `Request ${requestedPlan} plan upgrade` : undefined} /></label><label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>{mode === "plan_upgrade" ? "Why do you need this plan?" : "What happened?"}</span><Textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-32" /></label></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} disabled={!canSubmit} onClick={() => void submit()}><Send /> {mode === "plan_upgrade" ? "Send request" : "Send case"}</Button></DialogFooter></DialogContent></Dialog>;
}

function formatDateTime(value?: string) { if (!value) return "Not recorded"; const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : value; }
