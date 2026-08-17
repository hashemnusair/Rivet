"use client";

import {
  ArrowLeftRight,
  Bell,
  Dumbbell,
  Gauge,
  Home,
  KanbanSquare,
  ListFilter,
  OctagonAlert,
  ScanLine,
  ScrollText,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { DecorativeQr } from "./decorative-qr";
import { useT } from "@/lib/i18n/provider";

/**
 * The hero's product shot: the owner dashboard on a laptop with the member app
 * on a phone in front of it. Drawn entirely with the design system — no
 * screenshots to go stale — but the chrome is traced from the real product:
 * the sidebar sections come from `nav-config.ts`, the ruled six-cell KPI strip
 * and the "needs attention" rail from the owner dashboard, and the dock from
 * the member shell.
 *
 * Values stay deliberately non-numeric so the illustration cannot be mistaken
 * for a live customer claim; the vocabulary carries the meaning instead.
 */

/** Sidebar, in the real section order. Only the first item is active. */
type SectionKey = "overview" | "workspace" | "sales" | "finance" | "system";
type ItemKey = "dashboard" | "reception" | "members" | "personalTraining" | "leads" | "followUps" | "payments" | "auditLog";

const NAV: Array<{ section: SectionKey; items: Array<[ItemKey, LucideIcon]> }> = [
  { section: "overview", items: [["dashboard", Gauge]] },
  {
    section: "workspace",
    items: [
      ["reception", ShieldCheck],
      ["members", Users],
      ["personalTraining", Dumbbell],
    ],
  },
  {
    section: "sales",
    items: [
      ["leads", KanbanSquare],
      ["followUps", ListFilter],
    ],
  },
  { section: "finance", items: [["payments", ArrowLeftRight]] },
  { section: "system", items: [["auditLog", ScrollText]] },
];

/** The owner dashboard's KPI strip — one ruled panel, not six cards. */
type KpiKey = "collectedToday" | "thisMonth" | "outstanding" | "newMembers" | "renewals" | "checkIns";

const KPIS: ReadonlyArray<{ key: KpiKey; tone?: string }> = [
  { key: "collectedToday", tone: "text-success" },
  { key: "thisMonth" },
  { key: "outstanding", tone: "text-warning" },
  { key: "newMembers" },
  { key: "renewals", tone: "text-signal" },
  { key: "checkIns" },
];

/** Revenue series — the last column is the period in progress. */
const BARS = [34, 46, 39, 55, 48, 62, 57, 71, 64, 78, 69, 90] as const;

const FEED = [
  { id: "valid", tone: "text-success" },
  { id: "expiring", tone: "text-warning" },
  { id: "frozen", tone: "text-[#86a7d5]" },
] as const;

export function HeroDevices() {
  const t = useT();
  return (
    <>
      <div className="relative mx-auto w-full max-w-[620px] pb-16 lg:pb-16" aria-hidden>
        {/* ------------------------------------------------------------ laptop */}
        <div className="w-[86%] animate-rise-in">
          <div className="animate-drift">
            <div className="overflow-hidden rounded-t-xl border-[6px] border-night bg-night shadow-[0_28px_90px_-20px_rgb(27_26_21/0.4)]">
              <div className="flex aspect-[16/10] bg-paper text-ink">
                {/* ------------------------------------------------ sidebar
                    Narrow screens render the product's own collapsed sidebar
                    rather than a squeezed copy of the expanded one. */}
                <div className="night-surface flex w-[15%] flex-col bg-night px-1.5 pb-1.5 pt-1 text-night-ink sm:w-[25%]">
                  <div className="mb-2 flex items-center justify-center gap-1 px-1.5 pt-1 sm:justify-start">
                    <span className="h-2.5 w-1 rounded-[1px] bg-night-ink" />
                    <span className="hidden font-mono text-[6.5px] font-semibold tracking-[0.22em] text-night-ink sm:inline">
                      RIVET
                    </span>
                  </div>

                  {NAV.map((section, sectionIndex) => (
                    <div key={section.section} className="mb-1">
                      <p className="hidden px-1.5 font-mono text-[4.5px] uppercase tracking-[0.16em] text-night-ink-3 sm:block">
                        {t(`nav.section.${section.section}`)}
                      </p>
                      <div className="mt-0.5 space-y-px">
                        {section.items.map(([item, Icon], itemIndex) => {
                          const active = sectionIndex === 0 && itemIndex === 0;
                          return (
                            <div
                              key={item}
                              className={`relative flex items-center justify-center gap-1 rounded-[3px] px-1.5 py-[3px] sm:justify-start ${
                                active ? "bg-night-3" : ""
                              }`}
                            >
                              {active ? (
                                <span className="absolute inset-y-1 start-0 hidden w-[1.5px] rounded-full bg-signal sm:block" />
                              ) : null}
                              <Icon
                                className={`size-[6px] shrink-0 ${active ? "text-night-ink" : "text-night-ink-3"}`}
                                strokeWidth={2.2}
                              />
                              <span
                                className={`hidden truncate text-[5.5px] leading-none sm:inline ${
                                  active ? "font-medium text-night-ink" : "text-night-ink-2"
                                }`}
                              >
                                {t(`nav.item.${item}`)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="mt-auto flex items-center justify-center gap-1 border-t border-night-line px-1 pt-1.5 sm:justify-start">
                    <span className="flex size-3 items-center justify-center rounded-full bg-night-3 font-mono text-[4.5px] text-night-ink-2">
                      OA
                    </span>
                    <span className="hidden truncate text-[5px] text-night-ink-3 sm:inline">{t("marketing.device.gymOwner")}</span>
                  </div>
                </div>

                {/* --------------------------------------------- main pane */}
                <div className="flex min-w-0 flex-1 flex-col">
                  {/* topbar */}
                  <div className="flex items-center gap-1.5 border-b border-line bg-surface px-2 py-1.5">
                    <span className="flex min-w-0 flex-1 items-center gap-1 rounded-[3px] border border-line bg-paper px-1.5 py-[3px]">
                      <Search className="size-[6px] shrink-0 text-ink-4" strokeWidth={2.4} />
                      <span className="truncate text-[5.5px] text-ink-4">{t("marketing.device.searchPlaceholder")}</span>
                    </span>
                    <span className="hidden rounded-[3px] border border-line-2 px-1.5 py-[3px] text-[5.5px] text-ink-2 sm:inline">
                      {t("marketing.device.allBranches")}
                    </span>
                    <Bell className="size-[7px] shrink-0 text-ink-3" strokeWidth={2.2} />
                    <span className="size-3 shrink-0 rounded-full bg-sunken-2" />
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
                    {/* page header */}
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="font-mono text-[4.5px] uppercase tracking-[0.16em] text-ink-3">{t("marketing.device.today")}</p>
                        <p className="mt-[1px] text-[9px] font-semibold leading-none tracking-tight">{t("marketing.device.greeting")}</p>
                      </div>
                      <span className="flex items-center gap-1 font-mono text-[5px] uppercase tracking-[0.12em] text-success">
                        <LiveDot /> {t("marketing.device.live")}
                      </span>
                    </div>

                    {/* KPI strip — one ruled panel */}
                    <div className="grid grid-cols-3 divide-x divide-line rounded-[4px] border border-line bg-surface sm:grid-cols-6">
                      {KPIS.map((kpi, index) => (
                        <div
                          key={kpi.key}
                          className={`animate-fade-up px-1.5 py-1.5 ${index > 2 ? "hidden sm:block" : ""}`}
                          style={{ animationDelay: `${320 + index * 70}ms` }}
                        >
                          <p className="truncate font-mono text-[4.5px] uppercase tracking-[0.1em] text-ink-3">
                            {t(`marketing.device.kpi.${kpi.key}`)}
                          </p>
                          <p className="mt-1 truncate text-[7px] font-semibold leading-none">
                            {t(`marketing.device.kpi.${kpi.key}Value`)}
                          </p>
                          <p className={`mt-[3px] truncate text-[4.5px] ${kpi.tone ?? "text-ink-3"}`}>
                            {t(`marketing.device.kpi.${kpi.key}Note`)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* needs attention — kept left-weighted so the phone in
                        front of the laptop never covers the wording */}
                    <div
                      className="hidden animate-fade-up items-center gap-1.5 rounded-[4px] border border-line bg-surface px-2 py-1.5 sm:flex"
                      style={{ animationDelay: "760ms" }}
                    >
                      <OctagonAlert className="size-[7px] shrink-0 text-signal" strokeWidth={2.2} />
                      <span className="shrink-0 text-[5.5px] font-medium">{t("marketing.device.needsAttention")}</span>
                      <span className="shrink-0 rounded-[2px] bg-signal-bg px-1 py-px font-mono text-[4.5px] font-semibold text-signal-deep">
                        3
                      </span>
                      <span className="hidden truncate text-[5px] text-ink-3 sm:inline">
                        {t("marketing.device.drawerVariance")}
                      </span>
                    </div>

                    <div className="grid min-h-0 flex-1 gap-1.5 sm:grid-cols-[1.25fr_1fr]">
                      {/* revenue chart */}
                      <div className="flex min-h-0 flex-col rounded-[4px] border border-line bg-surface p-1.5">
                        <span className="font-mono text-[4.5px] uppercase tracking-[0.12em] text-ink-3">
                          {t("marketing.device.revenue30")}
                        </span>
                        <div className="mt-1 flex min-h-0 flex-1 items-end gap-[4%] border-b border-line pb-px">
                          {BARS.map((height, index) => (
                            <div
                              key={index}
                              className={`w-full origin-bottom animate-bar-rise rounded-t-[1.5px] ${
                                index === BARS.length - 1 ? "bg-signal" : "bg-sunken-2"
                              } ${index < 4 ? "hidden sm:block" : ""}`}
                              style={{ height: `${height}%`, animationDelay: `${500 + index * 55}ms` }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* reception live feed — the phone covers this column on
                          the narrowest screens, so it steps aside there */}
                      <div className="hidden min-h-0 flex-col rounded-[4px] border border-line bg-surface p-1.5 sm:flex">
                        <span className="flex items-center gap-1 font-mono text-[4.5px] uppercase tracking-[0.12em] text-ink-3">
                          {t("marketing.device.receptionLive")} <LiveDot />
                        </span>
                        <div className="mt-1 space-y-1">
                          {FEED.map((row, index) => (
                            <div
                              key={row.id}
                              className={`flex animate-fade-up items-center gap-1 rounded-[3px] border border-line px-1 py-[3px] ${
                                index === FEED.length - 1 ? "hidden sm:flex" : ""
                              }`}
                              style={{ animationDelay: `${900 + index * 220}ms` }}
                            >
                              <ScanLine className="size-[6px] shrink-0 text-ink-4" strokeWidth={2.2} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[5.5px] font-medium leading-tight">
                                  {t("marketing.device.memberEntry")}
                                </span>
                                {/* Verdict sits under the name, not at the far
                                    right, so the phone never crops it. */}
                                <span className="block truncate text-[4.5px] leading-tight text-ink-3">
                                  <span className={`font-mono font-semibold tracking-[0.08em] ${row.tone}`}>
                                    {t(`marketing.device.verdict.${row.id}`)}
                                  </span>{" "}
                                  · {t(`marketing.device.verdict.${row.id}Note`)}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* deck */}
            <div className="relative mx-[-4.5%] h-[13px] rounded-b-xl bg-night-2">
              <div className="absolute left-1/2 top-0 h-[5px] w-16 -translate-x-1/2 rounded-b-md bg-night-3" />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- phone */}
        {/* Fixed widths with a locked aspect ratio: the phone stays a phone at
            every breakpoint instead of stretching with the column. */}
        <div className="absolute bottom-0 end-0 w-[108px] animate-rise-in [animation-delay:220ms] sm:w-[146px] xl:w-[158px]">
          <div className="animate-float">
            <div className="rounded-[1.9rem] border-[5px] border-night bg-night p-px shadow-[0_22px_60px_-12px_rgb(27_26_21/0.45)]">
              <div className="relative flex aspect-[9/19.3] flex-col overflow-hidden rounded-[1.65rem] bg-paper">
                {/* dynamic island */}
                <div className="relative flex h-[7%] items-center justify-between px-3">
                  <span className="font-mono text-[5px] text-ink-3">9:41</span>
                  <span className="absolute left-1/2 top-[22%] h-[9px] w-[34%] -translate-x-1/2 rounded-full bg-night" />
                  <span className="flex items-center gap-[2px]">
                    <span className="h-[3px] w-[3px] rounded-full bg-ink-3" />
                    <span className="h-[4px] w-[3px] rounded-[1px] bg-ink-3" />
                    <span className="h-[5px] w-[6px] rounded-[1px] bg-ink-3" />
                  </span>
                </div>

                {/* member header */}
                <div className="flex items-center justify-between gap-1 border-b border-line px-2.5 pb-1.5">
                  <span className="truncate font-mono text-[5px] uppercase tracking-[0.16em] text-ink-3">
                    {t("marketing.device.phone.member")}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[5px] uppercase tracking-[0.12em] text-success">
                    <LiveDot /> {t("marketing.device.phone.active")}
                  </span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col px-2.5 pt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-[4px] bg-ink font-mono text-[5px] font-semibold text-paper">
                      GYM
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[8px] font-semibold leading-tight">{t("marketing.device.phone.membership")}</span>
                      <span className="block truncate text-[5.5px] leading-tight text-ink-3">{t("marketing.device.phone.gymBranch")}</span>
                    </span>
                  </div>

                  {/* Dropped on the narrowest phones so the entry code keeps a
                      usable square instead of collapsing to a strip. */}
                  <div className="mt-2 hidden grid-cols-2 gap-1 sm:grid">
                    <div className="rounded-[3px] border border-line bg-surface px-1.5 py-1">
                      <p className="font-mono text-[4.5px] uppercase tracking-[0.1em] text-ink-3">{t("marketing.device.phone.statusLabel")}</p>
                      <p className="mt-[2px] text-[7px] font-semibold leading-none text-success-deep">{t("marketing.device.phone.statusValue")}</p>
                    </div>
                    <div className="rounded-[3px] border border-line bg-surface px-1.5 py-1">
                      <p className="font-mono text-[4.5px] uppercase tracking-[0.1em] text-ink-3">{t("marketing.device.phone.visitsLabel")}</p>
                      <p className="mt-[2px] text-[7px] font-semibold leading-none">{t("marketing.device.phone.visitsValue")}</p>
                    </div>
                  </div>

                  {/* entry pass — the scan sweep runs continuously */}
                  <div className="night-surface mt-2 flex min-h-0 flex-1 flex-col rounded-[6px] bg-night p-2">
                    <p className="font-mono text-[4.5px] uppercase tracking-[0.14em] text-night-ink-3">{t("marketing.device.phone.entryPass")}</p>
                    {/* The code keeps its own square inside whatever box the
                        phone's flex column leaves it — `preserveAspectRatio`
                        centres it rather than letting it stretch. */}
                    <div className="relative mx-auto mt-1.5 flex min-h-0 w-full max-w-[88%] flex-1 items-center justify-center overflow-hidden rounded-[4px] bg-night-ink p-1.5 text-night">
                      <DecorativeQr className="h-full w-full" />
                      <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] animate-qr-scan bg-signal" />
                    </div>
                    <p className="mt-1.5 text-center font-mono text-[4.5px] uppercase tracking-[0.1em] text-night-ink-3">
                      {t("marketing.device.phone.scanAtDesk")}
                    </p>
                  </div>
                </div>

                {/* member dock */}
                <div className="mt-2 grid grid-cols-3 border-t border-line px-2 pb-2 pt-1.5">
                  {([
                    ["home", Home, true],
                    ["explore", Search, false],
                    ["account", UserRound, false],
                  ] as const).map(([label, Icon, active]) => {
                    const DockIcon = Icon;
                    return (
                      <span key={label} className="flex flex-col items-center gap-[2px]">
                        <span
                          className={`flex size-[13px] items-center justify-center rounded-[3px] ${
                            active ? "bg-sunken text-ink" : "text-ink-4"
                          }`}
                        >
                          <DockIcon className="size-[7px]" strokeWidth={2.2} />
                        </span>
                        <span className={`hidden text-[4.5px] sm:block ${active ? "text-ink" : "text-ink-4"}`}>
                          {t(`marketing.device.phone.${label}`)}
                        </span>
                      </span>
                    );
                  })}
                </div>

                <div className="mx-auto mb-1.5 h-[2.5px] w-[28%] rounded-full bg-ink-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="sr-only">
        {t("marketing.device.alt")}
      </p>
    </>
  );
}

/** The realtime marker used across the product — a dot with a breathing ring. */
function LiveDot() {
  return (
    <span className="relative flex size-1">
      <span className="absolute inset-0 animate-pulse-ring rounded-full bg-current" />
      <span className="relative size-1 rounded-full bg-current" />
    </span>
  );
}
