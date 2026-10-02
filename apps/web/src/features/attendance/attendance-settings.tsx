"use client";

import { useState } from "react";
import { useApp } from "@/lib/providers/app-providers";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import type { AttendanceSettings } from "@/lib/attendance/model";

export function AttendanceSettingsSection() {
  const { session } = useApp();
  const [selected, setSelected] = useState("");
  const branchId = selected || session?.activeBranchId || session?.branches[0]?.id || "";
  const query = useApiQuery(["attendance", "settings", branchId], api => api.getAttendanceSettings(branchId), { enabled: Boolean(branchId) });
  return <section className="space-y-5"><header><h2 className="text-[20px] font-semibold">Attendance & live occupancy</h2><p className="mt-1 text-[13px] text-ink-2">Configure estimates for members and your gym’s bespoke website.</p></header>
    <label className="block text-[13px] font-medium">Branch<select className="ms-3 min-h-11 rounded-md border border-line bg-surface px-3" value={branchId} onChange={e => setSelected(e.target.value)}>{session?.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : query.data ? <SettingsForm key={branchId} branchId={branchId} organizationId={session?.organization.id ?? ""} initial={query.data} /> : <p role="status">Loading attendance settings…</p>}
  </section>;
}
function SettingsForm({ branchId, organizationId, initial }: { branchId: string; organizationId: string; initial: AttendanceSettings }) {
  const [settings, setSettings] = useState(initial);
  const invalidate = useInvalidate();
  const save = useApiMutation((api, value: AttendanceSettings) => api.saveAttendanceSettings(branchId, value), { successMessage: "Attendance settings saved.", onSuccess: () => invalidate([["attendance"]]) });
  const fieldClass = "mt-1 block min-h-11 w-full rounded-md border border-line bg-surface px-3 text-[14px]";
  return <form className="panel space-y-5 p-5" onSubmit={e => { e.preventDefault(); save.mutate(settings); }}>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-[13px] font-medium">Estimated visit length (minutes)<input className={fieldClass} type="number" min={15} max={720} required value={settings.windowMinutes} onChange={e => setSettings({ ...settings, windowMinutes: Number(e.target.value) })} /></label>
      <label className="text-[13px] font-medium">Capacity (optional)<input className={fieldClass} type="number" min={1} max={100000} value={settings.capacity ?? ""} onChange={e => setSettings({ ...settings, capacity: e.target.value ? Number(e.target.value) : undefined })} /></label>
      <label className="text-[13px] font-medium">Branch timezone<input className={fieldClass} required value={settings.timezone} onChange={e => setSettings({ ...settings, timezone: e.target.value })} /></label>
      <label className="text-[13px] font-medium">Attendance source<select className={fieldClass} value={settings.feedMode} onChange={e => setSettings({ ...settings, feedMode: e.target.value as AttendanceSettings["feedMode"] })}><option value="reception">Reception check-ins</option><option value="external">Connected access system</option><option value="paused">Feed unavailable / paused</option></select></label></div>
    <p className="text-[12px] text-ink-2">Visit length applies to new entries. Existing windows keep their original length. Leave capacity blank to learn usual levels from attendance history.</p>
    {settings.feedMode === "external" ? <p className="text-[13px] text-warning-deep">A verified access-system adapter and regular heartbeat are required. No hardware integration is configured by this setting alone.</p> : null}
    <label className="flex min-h-11 items-start gap-3 border-t border-line pt-4 text-[14px]"><input className="mt-1 size-4" type="checkbox" checked={settings.publicEnabled} onChange={e => setSettings({ ...settings, publicEnabled: e.target.checked })} /><span>Publish aggregate occupancy on the gym’s website<span className="mt-1 block text-[12px] text-ink-2">Anyone with the public URL can read the estimated headcount and busyness status. No member details or private reports are published.</span></span></label>
    {settings.publicEnabled ? <div className="space-y-2 rounded-md bg-sunken p-3 text-[12px]"><p>Website integration references</p><p className="break-all font-mono">organizationId={organizationId}<br />branchId={branchId}</p><p>The website studio uses the documented public API and themeable occupancy component. Publication takes effect after saving.</p></div> : null}
    <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save attendance settings"}</Button>
  </form>;
}
