"use client";

import { ChevronDown, ChevronUp, LayoutPanelTop } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { MoneyText } from "@/components/shared/data-display";
import { qk } from "@/lib/api/keys";
import type { MemberResolutionContext, ResolutionPanelId } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";
import { RESOLUTION_PANELS, type ResolutionPanel } from "../../../convex/resolutionAssist";
import { BalancePanel, ClassesPanel, MembershipTermsPanel, OpenWorkPanel, PlanComparePanel, TrainersPanel, TrainingPaymentPanel, type PanelProps } from "./resolution-panels";

/**
 * The member resolution workspace: a stable, optional area at the top of
 * the member page. Every panel is a deterministic view over the member
 * record. Staff can open a panel by hand, "Show all" opens them all, and
 * "Standard view" folds the area away while the tabs and full history stay
 * exactly where they were. No panel executes an action by itself.
 */
const COLLAPSED_KEY = "rivet.resolution.collapsed";

export function useMemberResolution(memberId: string | undefined, enabled = true) {
  const query = useApiQuery(qk.memberResolution(memberId ?? ""), (api) => api.getMemberResolutionContext(memberId ?? ""), { enabled: enabled && Boolean(memberId), refetchOnWindowFocus: false });
  const data = query.data as unknown;
  const context = data && typeof data === "object" && "panels" in data && "facts" in data && "classes" in data ? (data as MemberResolutionContext) : undefined;
  return { ...query, context };
}

function readCollapsed(): boolean {
  try {
    return window.sessionStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.sessionStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Browser storage is a convenience only.
  }
}

const PANEL_COMPONENTS: Record<ResolutionPanelId, (props: PanelProps) => React.JSX.Element> = {
  "panel.training_payment": TrainingPaymentPanel,
  "panel.balance": BalancePanel,
  "panel.membership_terms": MembershipTermsPanel,
  "panel.plan_compare": PlanComparePanel,
  "panel.classes": ClassesPanel,
  "panel.trainers": TrainersPanel,
  "panel.open_work": OpenWorkPanel,
};

function UnresolvedFacts({ context }: { context: MemberResolutionContext }) {
  const items: string[] = [];
  const facts = context.facts;
  if (facts.outstandingMinor > 0) items.push("balance");
  if (facts.ptOrdersPending > 0) items.push(`${facts.ptOrdersPending} PT package${facts.ptOrdersPending === 1 ? "" : "s"} awaiting payment`);
  if (facts.membershipStatus === "frozen") items.push("membership frozen");
  else if (facts.daysUntilExpiry !== undefined && facts.daysUntilExpiry < 0) items.push(`term ended ${-facts.daysUntilExpiry} day${facts.daysUntilExpiry === -1 ? "" : "s"} ago`);
  else if (facts.daysUntilExpiry !== undefined && facts.daysUntilExpiry <= 14) items.push(facts.daysUntilExpiry === 0 ? "term ends today" : `term ends in ${facts.daysUntilExpiry} day${facts.daysUntilExpiry === 1 ? "" : "s"}`);
  if (facts.openTasks > 0) items.push(`${facts.openTasks} open task${facts.openTasks === 1 ? "" : "s"}`);
  return (
    <p className="text-[12.5px] text-ink-2" data-testid="resolution-facts">
      {items.length ? (
        <>
          <span className="font-medium text-ink">Unresolved now:</span>{" "}
          {items.map((item, index) => (
            <span key={item}>
              {index > 0 ? " · " : null}
              {item === "balance" ? <><MoneyText money={{ amount: facts.outstandingMinor, currency: context.currency }} /> outstanding</> : item}
            </span>
          ))}
        </>
      ) : "Nothing unresolved on record."}
    </p>
  );
}

export function ResolutionWorkspace({ memberId, memberName, onCreateTask }: { memberId: string; memberName: string; onCreateTask?: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(readCollapsed()); }, []);
  const [open, setOpen] = useState<ResolutionPanelId[]>([]);
  const { context, isLoading, isError, refetch } = useMemberResolution(memberId, !collapsed);
  const permitted = useMemo<ResolutionPanel[]>(() => (context ? RESOLUTION_PANELS.filter((panel) => context.panels.includes(panel.id)) : []), [context]);

  const openPanel = (id: ResolutionPanelId) => setOpen((current) => (current.includes(id) ? current : [id, ...current]));
  const closePanel = (id: ResolutionPanelId) => setOpen((current) => current.filter((item) => item !== id));
  const showAll = () => setOpen(permitted.map((panel) => panel.id));

  const setCollapsedAndRemember = (value: boolean) => { setCollapsed(value); writeCollapsed(value); };

  return (
    <section className="panel overflow-hidden" data-testid="resolution-area" aria-label="Resolution workspace">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <LayoutPanelTop className="size-4 shrink-0 text-ink-3" aria-hidden />
          <h2 className="font-display text-[14px] font-semibold">Resolve</h2>
          <span className="truncate text-[12px] text-ink-3">what {memberName.split(/\s+/)[0]} needs, without leaving the record</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setCollapsedAndRemember(!collapsed)} aria-expanded={!collapsed} aria-controls="resolution-body" data-testid="resolution-toggle">
          {collapsed ? <><ChevronDown /> Resolution area</> : <><ChevronUp /> Standard view</>}
        </Button>
      </header>
      {collapsed ? null : (
        <div id="resolution-body" className="space-y-3 border-t border-line px-4 py-3">
          {isLoading && !context ? <Skeleton className="h-16 w-full" /> : null}
          {isError && !context ? <p className="text-[12.5px] text-ink-3">The resolution context could not be loaded. <Button type="button" variant="link" size="xs" onClick={() => void refetch()}>Retry</Button></p> : null}
          {context ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] text-ink-3">Review recorded balances, membership, classes, trainers and open work.</span>
                <Button type="button" size="sm" variant="secondary" onClick={showAll} data-testid="resolution-show-all">Show all</Button>
              </div>
              <UnresolvedFacts context={context} />
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Panels">
                {permitted.map((panel) => (
                  <button key={panel.id} type="button" aria-pressed={open.includes(panel.id)} onClick={() => (open.includes(panel.id) ? closePanel(panel.id) : openPanel(panel.id))} data-testid={`resolution-chip-${panel.id}`} className={cn("min-h-8 rounded-full border px-3 text-[12px] font-medium transition-colors", open.includes(panel.id) ? "border-ink bg-ink text-paper" : "border-line-2 bg-surface text-ink-2 hover:border-line-3")}>
                    {panel.label}
                  </button>
                ))}
                {open.length ? <Button type="button" variant="link" size="xs" onClick={() => setOpen([])}>Close all</Button> : null}
              </div>
              {open.length ? (
                <div className="grid gap-3" data-testid="resolution-panels">
                  {open.map((id) => {
                    const Panel = PANEL_COMPONENTS[id];
                    return <Panel key={id} context={context} onClose={() => closePanel(id)} refetch={refetch} onCreateTask={onCreateTask} />;
                  })}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
