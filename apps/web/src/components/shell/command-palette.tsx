"use client";

import { Command } from "cmdk";
import {
  ArrowRight,
  Banknote,
  Gauge,
  KanbanSquare,
  ListFilter,
  Plus,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getApi } from "@/lib/api/client";
import type { LeadSummary, MemberSummary } from "@/lib/domain/types";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { Monogram } from "@/components/ui/misc";
import { MembershipStatusChip } from "@/components/shared/status-chip";

/**
 * Global command palette (⌘K): member/lead lookup plus navigation actions.
 * This is the fastest way to jump anywhere in daily operations.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const { canAny } = usePermissions();
  const { signedIn } = useApp();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setMembers([]);
      setLeads([]);
      return;
    }
    if (query.trim().length < 2) {
      setMembers([]);
      setLeads([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const api = getApi();
    const t = setTimeout(async () => {
      try {
        const [m, l] = await Promise.all([
          canAny(["members.read"]) ? api.listMembers({ search: query, pageSize: 6 }) : Promise.resolve(null),
          canAny(["crm.read"]) ? api.listLeads({ search: query, pageSize: 4 }) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setMembers(m?.items ?? []);
        setLeads(l?.items ?? []);
      } catch {
        if (!cancelled) {
          setMembers([]);
          setLeads([]);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, canAny]);

  if (!signedIn) return null;

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const pages = [
    { href: "/dashboard", label: "Dashboard", icon: Gauge },
    { href: "/reception", label: "Reception console", icon: ShieldCheck },
    { href: "/members", label: "Members", icon: Users, perm: ["members.read"] },
    { href: "/memberships", label: "Memberships", icon: WalletCards, perm: ["members.read"] },
    { href: "/crm/pipeline", label: "CRM pipeline", icon: KanbanSquare, perm: ["crm.read"] },
    { href: "/crm/queues", label: "Sales queues", icon: ListFilter, perm: ["crm.read"] },
    { href: "/payments", label: "Transactions", icon: Banknote, perm: ["reports.financial.read", "payments.collect"] },
    { href: "/payments/shifts", label: "Shifts & cash", icon: ScanLine, perm: ["reports.financial.read", "reconciliation.open_shift"] },
    { href: "/automations", label: "Automations", icon: Zap, perm: ["automations.manage"] },
    { href: "/audit", label: "Audit log", icon: ScrollText, perm: ["audit.read"] },
    { href: "/settings", label: "Settings", icon: Settings, perm: ["settings.manage", "users.manage"] },
  ].filter((p) => !p.perm || canAny(p.perm));

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Global search"
      className="fixed inset-0 z-[90]"
      shouldFilter={false}
    >
      <div className="fixed inset-0 bg-night/45 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />
      <div className="fixed left-1/2 top-[12vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface shadow-dialog animate-scale-in">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <ArrowRight className="size-4 text-ink-3" aria-hidden />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search members by name, phone or number — or jump to a page…"
            className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-ink-4"
            autoFocus
          />
        </div>
        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          {query.trim().length >= 2 ? (
            <>
              {searching ? <p className="px-3 py-2 text-[12.5px] text-ink-3">Searching…</p> : null}
              {!searching && members.length === 0 && leads.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-ink-3">
                  No members or leads match “{query}”.
                </p>
              ) : null}
              {members.length > 0 ? (
                <Command.Group heading={<GroupHeading>Members</GroupHeading>}>
                  {members.map((m) => (
                    <PaletteItem key={m.id} onSelect={() => go(`/members/${m.id}`)}>
                      <Monogram name={m.fullName} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{m.fullName}</span>
                        <span className="block font-mono text-[11px] text-ink-3">
                          {m.memberNumber} · {m.phone}
                        </span>
                      </span>
                      <MembershipStatusChip status={m.membershipStatus} />
                    </PaletteItem>
                  ))}
                </Command.Group>
              ) : null}
              {leads.length > 0 ? (
                <Command.Group heading={<GroupHeading>Leads</GroupHeading>}>
                  {leads.map((l) => (
                    <PaletteItem key={l.id} onSelect={() => go(`/crm/leads/${l.id}`)}>
                      <Monogram name={l.fullName} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{l.fullName}</span>
                        <span className="block font-mono text-[11px] text-ink-3">{l.phone}</span>
                      </span>
                    </PaletteItem>
                  ))}
                </Command.Group>
              ) : null}
            </>
          ) : (
            <>
              <Command.Group heading={<GroupHeading>Quick actions</GroupHeading>}>
                {canAny(["members.write"]) ? (
                  <PaletteItem onSelect={() => go("/members/new")}>
                    <Plus className="size-4 text-ink-3" /> New member
                  </PaletteItem>
                ) : null}
                <PaletteItem onSelect={() => go("/reception")}>
                  <ScanLine className="size-4 text-ink-3" /> Open reception console
                </PaletteItem>
                {canAny(["crm.write"]) ? (
                  <PaletteItem onSelect={() => go("/crm/pipeline?new=1")}>
                    <UserPlus className="size-4 text-ink-3" /> New lead
                  </PaletteItem>
                ) : null}
              </Command.Group>
              <Command.Group heading={<GroupHeading>Go to</GroupHeading>}>
                {pages.map((p) => (
                  <PaletteItem key={p.href} onSelect={() => go(p.href)}>
                    <p.icon className="size-4 text-ink-3" /> {p.label}
                  </PaletteItem>
                ))}
              </Command.Group>
            </>
          )}
        </Command.List>
        <div className="flex items-center gap-4 border-t border-line bg-paper/70 px-4 py-2 text-[11px] text-ink-3">
          <span className="flex items-center gap-1">
            <kbd className="rounded-sm border border-line bg-surface px-1 font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded-sm border border-line bg-surface px-1 font-mono">⏎</kbd> open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded-sm border border-line bg-surface px-1 font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </Command.Dialog>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow block px-2 pb-1 pt-2">{children}</span>;
}

function PaletteItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink outline-none data-[selected=true]:bg-sunken"
    >
      {children}
    </Command.Item>
  );
}
