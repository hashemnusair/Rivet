import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Bell,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronsLeft,
  CircleHelp,
  ClipboardCheck,
  Download,
  Dumbbell,
  FileBarChart,
  Gauge,
  Home,
  KanbanSquare,
  Keyboard,
  ListChecks,
  ListFilter,
  OctagonAlert,
  QrCode,
  ReceiptText,
  RefreshCcw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils/cn";

/**
 * The product, as illustration. Each surface below mirrors the markup and
 * classes of the real screen it stands for — the owner dashboard's sidebar,
 * topbar, KPI strip and Today queue; the member home and its Entry QR dialog —
 * so the landing shows what the product looks like rather than a sketch of
 * it. Controls are drawn, not wired: nothing here is focusable or live, the
 * figures are demonstration values from the preview tenant, and the code in
 * the QR is a fixed sample rather than a signed pass.
 */

export const DASHBOARD_SCREEN = { width: 1440, height: 900 } as const;
export const MEMBER_SCREEN = { width: 390, height: 787 } as const;

/** The value behind every drawn QR. Scanning it yields this text, never an entry. */
const SAMPLE_PASS = "RIVET entry pass — illustration only";

/* ------------------------------------------------------------------ owner */

const NAV: Array<{ label: string; items: Array<[string, LucideIcon]> }> = [
  { label: "Overview", items: [["Dashboard", Gauge]] },
  {
    label: "Workspace",
    items: [
      ["Reception", ShieldCheck],
      ["Checkout", ShoppingCart],
      ["Daily checklist", ClipboardCheck],
      ["Members", Users],
      ["Classes", CalendarDays],
      ["Personal training", Dumbbell],
      ["Stock & purchasing", Boxes],
    ],
  },
  { label: "Sales", items: [["Leads", KanbanSquare], ["Follow-ups", ListFilter]] },
  { label: "Finance", items: [["Payments", ArrowLeftRight], ["Reports", FileBarChart]] },
  { label: "Management ledger", items: [["Statements", ScrollText]] },
  {
    label: "System",
    items: [
      ["Audit log", ScrollText],
      ["Data exports", Download],
      ["Support", CircleHelp],
      ["Settings", Settings],
    ],
  },
];

const KPIS: ReadonlyArray<{ label: string; value: string; context: React.ReactNode; tone?: "warning" }> = [
  { label: "Collected today", value: "JOD 662.750", context: null },
  {
    label: "This month",
    value: "JOD 14.2K",
    context: (
      <span className="inline-flex items-center gap-0.5 text-success-deep">
        <ArrowUpRight className="size-3" /> 12% vs last month
      </span>
    ),
  },
  { label: "Outstanding", value: "JOD 592.000", context: "unpaid balances", tone: "warning" },
  { label: "New members", value: "14", context: "this month" },
  { label: "Renewals ≤ 7d", value: "5", context: "3 expired ≤ 30d", tone: "warning" },
  { label: "Check-ins today", value: "41", context: "9 open leads" },
];

const QUEUE: ReadonlyArray<{
  icon: LucideIcon;
  kind: string;
  branch: string;
  title: string;
  detail: string;
  amount?: string;
  when: string;
  action: string;
  urgent?: boolean;
  done?: boolean;
}> = [
  { icon: ListChecks, kind: "Cash", branch: "Forge — Abdoun", title: "Review Forge — Abdoun cash variance", detail: "Closed by the evening shift", amount: "−JOD 7.000", when: "2 hours ago", action: "Review", urgent: true },
  { icon: CalendarClock, kind: "Follow-up", branch: "Forge — Abdoun", title: "Follow up — trial from Tuesday", detail: "Walk-in lead · assigned to sales", when: "today", action: "Done", done: true },
  { icon: ClipboardCheck, kind: "Renewal", branch: "Forge — Sweifieh", title: "Renewal due — 6-Month All Access", detail: "Expires in 5 days", amount: "JOD 180.000", when: "today", action: "Renew" },
  { icon: Banknote, kind: "Balance", branch: "Forge — Abdoun", title: "Collect outstanding JOD 42.750", detail: "Installment 2 of 2", when: "yesterday", action: "Done", done: true },
];

/** The owner dashboard at 1440 × 900, as `/dashboard` renders it. */
export function OwnerDashboardScreen() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-paper text-ink [font-family:var(--font-manrope),system-ui,sans-serif]">
      {/* sidebar */}
      <aside className="night-surface absolute inset-y-0 start-0 flex w-[228px] flex-col bg-night text-night-ink">
        <div className="flex h-16 items-center border-b border-night-line px-4">
          <Image src="/brand/rivet-lockup-rev.png" alt="" width={110} height={28} className="shrink-0" />
        </div>
        <nav className="flex-1 overflow-hidden px-2 py-3">
          {NAV.map((section) => (
            <div key={section.label} className="mb-4">
              <div className="h-5 px-3.5 text-[12px] font-medium leading-4 text-night-ink-3">{section.label}</div>
              <ul className="space-y-0.5">
                {section.items.map(([label, Icon]) => {
                  const active = label === "Dashboard";
                  return (
                    <li key={label}>
                      <span
                        className={cn(
                          "relative flex h-8 items-center gap-2.5 rounded-md px-3.5 text-[13px]",
                          active ? "bg-night-3 font-medium text-night-ink" : "text-night-ink-2",
                        )}
                      >
                        {active ? <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-signal" /> : null}
                        <Icon className={cn("size-4 shrink-0", active ? "text-night-ink" : "text-night-ink-3")} />
                        <span className="truncate">{label}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-night-line p-2">
          <span className="flex h-8 items-center gap-2.5 rounded-md px-3.5 text-[12px] text-night-ink-3">
            <ChevronsLeft className="size-4" /> Collapse
          </span>
        </div>
      </aside>

      {/* topbar */}
      <header className="absolute end-0 start-[228px] top-0 flex h-16 items-center gap-3 border-b border-line bg-paper/90 px-4">
        <span className="flex h-8 w-72 items-center gap-2 rounded-md border border-line-2 bg-surface px-2.5 text-[13px] text-ink-3">
          <Search className="size-3.5" />
          <span className="flex-1">Search…</span>
          <kbd className="inline-flex h-5 items-center rounded-sm border border-line bg-paper px-1 font-mono text-[10.5px] text-ink-3">⌘K</kbd>
        </span>
        <span className="flex h-8 w-44 items-center gap-2 rounded-md border border-line-2 bg-surface px-2.5 text-[13px] text-ink">
          <Building2 className="size-3.5 text-ink-3" />
          <span className="flex-1">All branches</span>
          <ChevronDown className="size-3.5 text-ink-3" />
        </span>
        <span className="flex-1" />
        <Bell className="size-4 text-ink-2" />
        <Keyboard className="ms-3 size-4 text-ink-2" />
        <span className="ms-3 flex items-center gap-2 rounded-md px-1.5 py-1">
          <span className="flex size-8 items-center justify-center rounded-full bg-night text-[11px] font-semibold text-paper">OA</span>
          <span className="leading-tight">
            <span className="block text-[13px] font-medium text-ink">Omar Al-Khatib</span>
            <span className="block text-[12px] font-medium text-ink-3">Owner</span>
          </span>
          <ChevronDown className="size-3.5 text-ink-3" />
        </span>
      </header>

      {/* page */}
      <main className="absolute bottom-0 end-0 start-[228px] top-16 space-y-5 overflow-hidden px-8 pt-8">
        <div>
          <p className="mb-1.5 text-[12px] font-medium leading-4 text-ink-3">Today</p>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">Good morning, Omar</h1>
          <p className="mt-1 text-[13.5px] text-ink-2">All 2 branches, consolidated.</p>
        </div>

        <section className="panel grid grid-cols-6 divide-x divide-line">
          {KPIS.map((kpi) => (
            <div key={kpi.label} className="px-4 py-3.5">
              <p className="text-[12px] font-medium leading-4 text-ink-3">{kpi.label}</p>
              <div className={cn("mt-1 text-[22px] font-medium leading-none tabular tracking-tight", kpi.tone === "warning" && "text-warning-deep")}>{kpi.value}</div>
              {kpi.context ? <div className="mt-1 text-[12px] text-ink-3">{kpi.context}</div> : null}
            </div>
          ))}
        </section>

        <section className="panel overflow-hidden">
          <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-line px-5 py-3.5">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-md bg-ink text-paper"><ListChecks className="size-3.5" /></span>
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Today</h2>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">Start at the top. RIVET has already put the work in order.</p>
            </div>
            <div className="text-end">
              <p className="text-[18px] font-semibold leading-none tabular">12</p>
              <p className="mt-1 text-[12px] text-ink-3">3 urgent</p>
            </div>
          </header>
          <ol className="divide-y divide-line">
            {QUEUE.map((item, index) => (
              <li key={item.title} className={cn("grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-3.5", index === 0 && "bg-danger-bg/35")}>
                <item.icon className={cn("size-4", item.urgent ? "text-danger" : "text-ink-3")} />
                <div className="min-w-0">
                  <div className="flex items-center gap-x-2">
                    {index === 0 ? <span className="text-[12.5px] font-semibold text-signal-deep">Next priority</span> : null}
                    <span className="text-[12.5px] text-ink-3">{item.kind}</span>
                    <span className="truncate text-[12px] text-ink-4">{item.branch}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[13.5px] font-semibold text-ink">{item.title}</p>
                  <p className="mt-0.5 flex items-center gap-x-2 text-[12px] text-ink-3">
                    <span>{item.detail}</span>
                    {item.amount ? <span className="font-medium text-ink-2 tabular">{item.amount}</span> : null}
                    <span className={cn(item.urgent && "font-medium text-danger")}>{item.when}</span>
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium",
                    item.urgent ? "bg-ink text-paper" : "border border-line-2 bg-surface text-ink",
                  )}
                >
                  {item.done ? <Check className="size-4" /> : null}
                  {item.action}
                  {item.done ? null : <ArrowRight className="size-4" />}
                </span>
              </li>
            ))}
          </ol>
          <div className="border-t border-line bg-sunken/25 px-4 py-2 text-center text-[13px] font-medium text-ink-2">
            <span className="inline-flex items-center gap-2">Show 8 more <ArrowRight className="size-4" /></span>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold">
              <OctagonAlert className="size-4 text-signal" />
              Needs attention
              <span className="rounded-sm bg-signal-bg px-1.5 py-0.5 text-[11px] font-medium text-signal-deep tabular">4</span>
            </h2>
            <span className="inline-flex items-center gap-1 text-[12px] text-ink-3">Full audit trail <ArrowRight className="size-3" /></span>
          </header>
          <ul className="divide-y divide-line">
            <li className="flex items-center gap-3 px-4 py-2.5">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">Price override awaiting approval</span>
                <span className="block truncate text-[12px] text-ink-3">Reception · 6-Month All Access · reason recorded</span>
              </span>
              <span className="shrink-0 text-[11.5px] text-ink-3">1 hour ago</span>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------- member */

/** The Entry QR dialog, exactly as the member app draws it. */
export function EntryPassCard({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-sm rounded-lg border border-line bg-surface text-ink shadow-dialog", className)}>
      <div className="relative border-b border-line px-5 py-4">
        <p className="font-display text-[17px] font-semibold tracking-tight text-ink">Entry QR</p>
        <p className="mt-1 text-[13px] text-ink-2">Forge Fitness Club</p>
        <span className="absolute end-3 top-3 rounded-sm p-1.5 text-ink-3"><X className="size-4" /></span>
      </div>
      <div className="px-5 py-4 text-center">
        <div className="mx-auto w-fit rounded-lg border border-line bg-white p-4">
          <QRCodeSVG value={SAMPLE_PASS} size={232} level="H" bgColor="#ffffff" fgColor="#15140f" className="block h-auto w-full max-w-[232px]" />
        </div>
        <p className="mt-4 font-mono text-[18px] tracking-wide text-ink">ABD-2214</p>
        <p className="mt-2 text-[13px] text-ink-2">Expires at 09:56. Show it at reception, then close this window.</p>
        <span className="mt-4 inline-flex h-8 items-center gap-2 rounded-md border border-line-2 bg-surface px-3 text-[13px] font-medium text-ink">
          <RefreshCcw className="size-4" /> Get a fresh pass
        </span>
      </div>
    </div>
  );
}

/** The member home at 390 wide with the Entry QR open, as `/customer/my-gyms?entry=1` renders it. */
export function MemberEntryScreen() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-paper text-ink [font-family:var(--font-manrope),system-ui,sans-serif]">
      {/* The page under the dialog is blurred in place rather than through a
          backdrop filter, which mirrors content at the screen's edges. */}
      <div className="absolute inset-0 blur-[3px]">
      <header className="flex h-16 items-center border-b border-line px-4">
        <Image src="/brand/rivet-lockup.png" alt="" width={112} height={29} />
      </header>

      <main className="px-4 py-6">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">Hi, Lina</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">Your entry pass and memberships, ready when you are.</p>

        <section className="mt-7">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-semibold">Subscribed gyms</h2>
            <span className="text-[12px] text-ink-3 tabular">1 gym</span>
          </div>
          <article className="panel mt-3 overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-signal font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white">Forge</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-[16px] font-semibold leading-tight">Forge Fitness Club</h3>
                  <span className="inline-flex items-center gap-1.5 rounded-sm bg-success-bg px-1.5 py-0.5 text-[11px] font-medium leading-4 text-success-deep">
                    <span className="size-1.5 rounded-full bg-current" /> Active
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-ink-2">6-Month All Access · Forge — Abdoun</p>
                <p className="mt-0.5 text-[13px] text-ink-3">Active until 12 Feb 2027</p>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-line px-4 py-3">
              <span className="inline-flex h-8 items-center gap-2 rounded-md bg-ink px-3 text-[13px] font-medium text-paper"><QrCode className="size-4" /> Entry QR</span>
              <span className="inline-flex h-8 items-center gap-2 rounded-md border border-line-2 bg-surface px-3 text-[13px] font-medium text-ink">Membership <ArrowRight className="size-4" /></span>
              <span className="ms-auto font-mono text-[12px] text-ink-3">ABD-2214</span>
            </div>
          </article>
        </section>
      </main>

      {/* member dock */}
      <nav className="absolute inset-x-0 bottom-0 border-t border-line bg-paper/95">
        <div className="grid h-16 grid-cols-4 px-3">
          {[
            ["Home", Home, true],
            ["Payments", ReceiptText, false],
            ["Explore", Search, false],
            ["Account", UserRound, false],
          ].map(([label, Icon, active]) => {
            const DockIcon = Icon as LucideIcon;
            return (
              <span key={label as string} className={cn("flex flex-col items-center justify-center gap-1 text-[12px] font-medium", active ? "text-ink" : "text-ink-3")}>
                <span className={cn("flex h-8 w-11 items-center justify-center rounded-md", active && "bg-sunken")}>
                  <DockIcon className="size-[18px]" />
                </span>
                {label as string}
              </span>
            );
          })}
        </div>
      </nav>

      </div>

      {/* the Entry QR dialog, open over the page */}
      <div className="absolute inset-0 bg-ink/35" />
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2">
        <EntryPassCard className="mx-auto" />
      </div>
    </div>
  );
}
