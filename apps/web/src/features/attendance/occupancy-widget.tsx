"use client";

import { useEffect, useState, type CSSProperties } from "react";

/** Portable presentational contract: only aggregates. Copy with this component for a bespoke /live page. */
export interface PublicOccupancy {
  current: number | null;
  status: "quiet" | "moderate" | "busy" | "learning" | "unavailable";
  availability: "available" | "stale" | "unavailable";
  generatedAt: number;
  validUntil: number;
  timezone: string;
}
export type OccupancyTheme = CSSProperties & Partial<Record<"--occupancy-ink" | "--occupancy-muted" | "--occupancy-surface" | "--occupancy-line", string>>;
export function OccupancyReading({ data, failed = false, loading = false, title = "At the gym now", style, className }: { data?: PublicOccupancy; failed?: boolean; loading?: boolean; title?: string; style?: OccupancyTheme; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const tick = () => { setNow(Date.now()); setOnline(navigator.onLine); };
    tick();
    const timer = setInterval(tick, 1000);
    window.addEventListener("online", tick); window.addEventListener("offline", tick); window.addEventListener("focus", tick);
    return () => { clearInterval(timer); window.removeEventListener("online", tick); window.removeEventListener("offline", tick); window.removeEventListener("focus", tick); };
  }, []);
  const usable = data && online && !failed && now < data.validUntil && data.availability === "available" && data.current !== null;
  const label = data?.status === "quiet" ? "Quiet" : data?.status === "moderate" ? "Moderate" : data?.status === "busy" ? "Busy" : "Learning usual levels";
  return <section className={className} aria-label={title} style={{ padding: 20, border: "1px solid var(--occupancy-line, #E3E1D6)", borderRadius: 8, background: "var(--occupancy-surface, #fff)", color: "var(--occupancy-ink, #1B1A15)", fontFamily: "inherit", textAlign: "start", ...style }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h2>
      {usable ? <span style={{ fontSize: 12, color: "var(--occupancy-muted, #565449)" }}>{label}</span> : null}
    </div>
    <p role="status" aria-live="polite" style={{ margin: "10px 0 6px", fontSize: usable ? 28 : 16, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1.3 }}>{usable ? `~${data.current} people` : loading && !data ? "Checking attendance…" : "Live estimate unavailable"}</p>
    <p style={{ margin: 0, fontSize: 12, color: "var(--occupancy-muted, #565449)" }}>{usable ? "Based on recent check-ins." : data ? "The feed may be out of date. Check again shortly." : "We couldn’t get a current estimate. Check again shortly."}</p>
  </section>;
}
function isOccupancy(value: unknown): value is PublicOccupancy {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.version === 1 && (v.current === null || (typeof v.current === "number" && Number.isInteger(v.current) && v.current >= 0)) && typeof v.validUntil === "number" && typeof v.generatedAt === "number" && typeof v.timezone === "string" && ["quiet", "moderate", "busy", "learning", "unavailable"].includes(String(v.status)) && ["available", "stale", "unavailable"].includes(String(v.availability));
}
/** No cookies, API keys or member information. Endpoint must be the authorized gym/branch's public URL. */
export function PublicOccupancyWidget({ endpoint, title, style, className }: { endpoint: string; title?: string; style?: OccupancyTheme; className?: string }) {
  const [state, setState] = useState<{ endpoint: string; data?: PublicOccupancy; failed: boolean; loading: boolean }>({ endpoint, failed: false, loading: true });
  useEffect(() => {
    let stopped = false; let pending = false;
    const controller = new AbortController();
    const load = async () => {
      if (pending || stopped) return;
      pending = true;
      try {
        const response = await fetch(endpoint, { credentials: "omit", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        if (!response.ok) throw new Error("Unavailable");
        const data: unknown = await response.json();
        if (!isOccupancy(data)) throw new Error("Invalid occupancy response");
        if (!stopped) setState({ endpoint, data, failed: false, loading: false });
      } catch { if (!stopped) setState({ endpoint, failed: true, loading: false }); }
      finally { pending = false; }
    };
    void load(); const timer = setInterval(() => void load(), 15_000);
    const resume = () => void load();
    window.addEventListener("online", resume); window.addEventListener("focus", resume);
    return () => { stopped = true; clearInterval(timer); controller.abort(); window.removeEventListener("online", resume); window.removeEventListener("focus", resume); };
  }, [endpoint]);
  return <OccupancyReading data={state.endpoint === endpoint ? state.data : undefined} failed={state.endpoint === endpoint && state.failed} loading={state.endpoint !== endpoint || state.loading} title={title} style={style} className={className} />;
}
