import { DecorativeQr } from "./decorative-qr";

/**
 * The hero's product shot: the owner dashboard on a laptop with the member app
 * on a phone in front of it. Drawn entirely with the design system — no
 * screenshots to go stale. Values are deliberately non-numeric so the
 * illustration cannot be mistaken for a live customer claim.
 */
const FEED = [
  { id: "entry-valid", time: "now", name: "Member entry", note: "membership active", verdict: "VALID", tone: "text-success" },
  { id: "entry-expiring", time: "now", name: "Member entry", note: "renewal due", verdict: "EXPIRING", tone: "text-warning" },
  { id: "entry-frozen", time: "now", name: "Member entry", note: "membership frozen", verdict: "FROZEN", tone: "text-[#86a7d5]" },
] as const;

/** Weekly revenue bars — the last one is the week in progress. */
const BARS = [38, 52, 44, 60, 55, 68, 62, 84] as const;

const NAV = ["Dashboard", "Reception", "Members", "Pipeline", "Payments", "Audit"] as const;

export function HeroDevices() {
  return (
    <>
      <div className="relative pb-12 pe-2 sm:pe-8" aria-hidden>
        {/* ------------------------------------------------------------ laptop */}
        <div className="animate-fade-up">
          <div className="overflow-hidden rounded-t-xl border-[6px] border-night bg-night shadow-[0_24px_80px_rgb(27_26_21/0.28)]">
            <div className="flex aspect-[16/10] bg-paper text-ink">
              {/* sidebar */}
              <div className="night-surface flex w-[23%] flex-col bg-night p-2 text-night-ink">
                <div className="mb-2.5 flex items-center gap-1 px-1 pt-0.5">
                  <span className="h-2.5 w-1 rounded-[1px] bg-night-ink" />
                  <span className="font-mono text-[7px] font-semibold tracking-[0.2em] text-night-ink">RIVET</span>
                </div>
                {NAV.map((item, index) => (
                  <div
                    key={item}
                    className={`mb-0.5 flex items-center gap-1.5 rounded-sm px-1.5 py-[5px] ${index === 0 ? "bg-night-3" : ""}`}
                  >
                    {index === 0 ? <span className="h-2 w-[2px] rounded-full bg-signal" /> : <span className="size-[3px] rounded-full bg-night-ink-3" />}
                    <span className={`text-[7px] leading-none ${index === 0 ? "text-night-ink" : "text-night-ink-3"}`}>{item}</span>
                  </div>
                ))}
                <div className="mt-auto flex items-center gap-1.5 border-t border-night-line px-1 pt-1.5">
                  <span className="flex size-3 items-center justify-center rounded-full bg-night-3 font-mono text-[5px] text-night-ink-2">OA</span>
                  <span className="text-[6px] text-night-ink-3">Gym owner</span>
                </div>
              </div>

              {/* main pane */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-line bg-surface px-2.5 py-1.5">
                  <span className="text-[8px] font-semibold">Dashboard</span>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-sm border border-line-2 px-1.5 py-0.5 text-[6px] text-ink-2">Selected branch</span>
                    <span className="flex items-center gap-1 font-mono text-[6px] uppercase tracking-[0.1em] text-success">
                      <span className="size-1 animate-pulse rounded-full bg-success" /> Live
                    </span>
                  </div>
                </div>

                <div className="grid flex-1 grid-rows-[auto_1fr] gap-1.5 p-1.5">
                  {/* KPI row */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <Kpi label="Revenue · month" value="Ledger" note="persisted payments" noteTone="text-success" />
                    <Kpi label="Active members" value="Live" note="all branches" />
                    <Kpi label="Renewals · 7d" value="Queue" note="actionable records" noteTone="text-signal" />
                  </div>

                  <div className="grid min-h-0 grid-cols-[1.15fr_1fr] gap-1.5">
                    {/* revenue chart */}
                    <div className="flex min-h-0 flex-col rounded-md border border-line bg-surface p-2">
                      <span className="font-mono text-[6px] uppercase tracking-[0.12em] text-ink-3">Revenue · last 8 weeks</span>
                      <div className="mt-1.5 flex min-h-0 flex-1 items-end gap-[5%] border-b border-line pb-px">
                        {BARS.map((height, index) => (
                          <div
                            key={index}
                            className={`w-full rounded-t-[2px] ${index === BARS.length - 1 ? "bg-signal" : "bg-sunken-2"}`}
                            style={{ height: `${height}%` }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* reception feed */}
                    <div className="flex min-h-0 flex-col rounded-md border border-line bg-surface p-2">
                      <span className="font-mono text-[6px] uppercase tracking-[0.12em] text-ink-3">Reception · live feed</span>
                      <div className="mt-1.5 space-y-1">
                        {FEED.map((row) => (
                          <div key={row.id} className="flex items-center gap-1.5 rounded-sm border border-line px-1.5 py-1">
                            <span className="font-mono text-[6px] text-ink-3">{row.time}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[7px] font-medium leading-tight">{row.name}</span>
                              <span className="block truncate text-[6px] leading-tight text-ink-3">{row.note}</span>
                            </span>
                            <span className={`font-mono text-[5.5px] font-semibold tracking-[0.1em] ${row.tone}`}>{row.verdict}</span>
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

        {/* ------------------------------------------------------------- phone */}
        <div className="absolute -bottom-2 -end-1 w-[36%] min-w-[150px] max-w-[200px] animate-fade-up [animation-delay:200ms] sm:-end-4">
          <div className="animate-float">
            <div className="rounded-[1.7rem] border-[5px] border-night bg-night shadow-[0_18px_50px_rgb(27_26_21/0.35)]">
              <div className="overflow-hidden rounded-[1.4rem] bg-paper">
                <div className="mx-auto mt-1.5 h-[9px] w-12 rounded-full bg-night" />
                <div className="p-2.5 pt-2">
                  <div className="flex items-center justify-between font-mono text-[6px] uppercase tracking-[0.14em] text-ink-3">
                    <span>RIVET MEMBER</span>
                    <span>LIVE</span>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold leading-tight">Member account</p>
                  <p className="font-mono text-[6px] text-ink-3">ACTIVE MEMBERSHIP</p>

                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <div className="rounded-sm border border-line bg-surface p-1.5">
                      <p className="font-mono text-[5px] uppercase tracking-[0.1em] text-ink-3">Membership</p>
                      <p className="mt-0.5 text-[9px] font-semibold leading-none text-success-deep">Current</p>
                    </div>
                    <div className="rounded-sm border border-line bg-surface p-1.5">
                      <p className="font-mono text-[5px] uppercase tracking-[0.1em] text-ink-3">Visits</p>
                      <p className="mt-0.5 text-[9px] font-semibold leading-none">History</p>
                    </div>
                  </div>

                  <div className="mt-2 rounded-md bg-night p-1.5">
                    <div className="rounded-sm bg-night-ink p-1.5 text-night">
                      <DecorativeQr />
                    </div>
                    <p className="mt-1 text-center font-mono text-[5px] uppercase tracking-[0.12em] text-night-ink-3">
                      Entry pass · selected gym
                    </p>
                  </div>

                  <div className="mx-auto mt-1.5 h-[3px] w-10 rounded-full bg-sunken-2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="sr-only">
        Illustrative RIVET dashboard and member app preview with no customer or operational data.
      </p>
    </>
  );
}

function Kpi({
  label,
  value,
  note,
  noteTone = "text-ink-3",
}: {
  label: string;
  value: string;
  note: string;
  noteTone?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-2">
      <p className="font-mono text-[6px] uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <p className="mt-1 text-[11px] font-semibold leading-none tabular">{value}</p>
      <p className={`mt-0.5 text-[6px] ${noteTone}`}>{note}</p>
    </div>
  );
}
