"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/ui/states";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox, Switch } from "@/components/ui/switch";
import { SettingsPanel, SettingsSaveBar } from "@/features/settings/settings-layout";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { OperationalPolicies, WeekdayKey } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_ROWS: Array<{ key: WeekdayKey; label: string }> = [
  { key: "sun", label: "Sunday" },
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
];

type OperatingDays = OperationalPolicies["operatingHours"][number]["days"];
type TrialDays = OperationalPolicies["trialSchedules"][number]["days"];

function defaultOperatingDays(): OperatingDays {
  return Object.fromEntries(WEEKDAY_ROWS.map(({ key }) => [key, {
    enabled: key !== "fri",
    opensAt: key === "sat" ? "07:00" : "06:00",
    closesAt: key === "sat" ? "22:00" : "23:00",
  }])) as OperatingDays;
}

function defaultTrialDays(): TrialDays {
  return Object.fromEntries(WEEKDAY_ROWS.map(({ key }) => [key, { enabled: false, opensAt: "09:00", closesAt: "20:00" }])) as TrialDays;
}

function normalizedOperatingDays(days?: OperatingDays): OperatingDays {
  const defaults = defaultOperatingDays();
  return Object.fromEntries(WEEKDAY_ROWS.map(({ key }) => [key, { ...defaults[key], ...(days?.[key] ?? {}) }])) as OperatingDays;
}

function normalizedTrialDays(days?: TrialDays): TrialDays {
  const source: Partial<TrialDays> = days ?? {};
  return Object.fromEntries(WEEKDAY_ROWS.map(({ key }) => {
    const day = source[key] as TrialDays[WeekdayKey] & { slots?: string[] } | undefined;
    if (typeof day?.enabled === "boolean") return [key, day];
    const slots = [...(day?.slots ?? [])].sort();
    const onlySlot = slots.length === 1 ? slots[0] : undefined;
    const [onlyHour = 0, onlyMinute = 0] = onlySlot?.split(":").map(Number) ?? [];
    const legacyClosingMinutes = Math.min(23 * 60 + 59, onlyHour * 60 + onlyMinute + 60);
    return [key, {
      enabled: slots.length > 0,
      opensAt: slots[0] ?? "09:00",
      closesAt: onlySlot ? `${String(Math.floor(legacyClosingMinutes / 60)).padStart(2, "0")}:${String(legacyClosingMinutes % 60).padStart(2, "0")}` : (slots.at(-1) ?? "20:00"),
    }];
  })) as TrialDays;
}

type OperationalPoliciesInput = {
  entry?: Partial<OperationalPolicies["entry"]>;
  membership?: Partial<OperationalPolicies["membership"]>;
  personalTraining?: Partial<OperationalPolicies["personalTraining"]>;
  referrals?: Partial<OperationalPolicies["referrals"]>;
  memberFreezes?: Partial<OperationalPolicies["memberFreezes"]>;
  classBooking?: Partial<OperationalPolicies["classBooking"]>;
  retention?: Partial<OperationalPolicies["retention"]>;
  operatingHours?: OperationalPolicies["operatingHours"];
  trialSchedules?: OperationalPolicies["trialSchedules"];
};

export function normalizeOperationalPolicies(value?: OperationalPoliciesInput): OperationalPolicies {
  return {
    entry: {
      outstandingBalance: "warn",
      expiryWarningDays: 7,
      duplicateScanWindowMinutes: 2,
      enforceOperatingHours: false,
      ...value?.entry,
    },
    membership: {
      allowOverlappingMemberships: false,
      renewalWindowDays: 14,
      minimumFreezeDays: 1,
      maximumExtensionDays: 365,
      ...value?.membership,
    },
    personalTraining: {
      sessionDurationMinutes: 60,
      bookingHorizonDays: 30,
      cancellationCutoffHours: 12,
      ...value?.personalTraining,
    },
    referrals: {
      enabled: false,
      rewardDays: 7,
      maxRewardDaysPerWindow: 30,
      windowDays: 90,
      ...value?.referrals,
    },
    memberFreezes: {
      requestsEnabled: false,
      freeFreezesPerWindow: 1,
      extraFreezeFeeMinor: 10_000,
      maxDaysPerFreeze: 30,
      windowDays: 365,
      ...value?.memberFreezes,
    },
    classBooking: {
      enabled: true,
      eligibilityMode: "all_active_memberships",
      eligiblePlanIds: [],
      bookingHorizonDays: 30,
      cancellationCutoffHours: 2,
      maxActiveBookingsPerMember: 8,
      waitlistEnabled: true,
      waitlistSize: 12,
      noShowTracking: true,
      ...value?.classBooking,
    },
    retention: {
      inactivityDays: 14,
      expiredWinBackDays: 90,
      defaultSnoozeDays: 7,
      ...value?.retention,
    },
    operatingHours: Array.isArray(value?.operatingHours)
      ? value.operatingHours.map((schedule) => ({ ...schedule, days: normalizedOperatingDays(schedule.days) }))
      : [],
    trialSchedules: Array.isArray(value?.trialSchedules)
      ? value.trialSchedules.map((schedule) => ({ ...schedule, days: normalizedTrialDays(schedule.days) }))
      : [],
  };
}

function policySnapshot(value: OperationalPolicies | null): string {
  return value ? JSON.stringify(value) : "";
}

function useOperationalPoliciesDraft() {
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [policies, setPolicies] = useState<OperationalPolicies | null>(null);
  const [baseline, setBaseline] = useState<OperationalPolicies | null>(null);
  const dirty = Boolean(policies && baseline && policySnapshot(policies) !== policySnapshot(baseline));
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings || dirtyRef.current) return;
    const operationalPolicies = normalizeOperationalPolicies(settings.operationalPolicies);
    const branchIds = (settings.branches ?? []).filter((branch) => branch.status === "active").map((branch) => branch.id);
    const next: OperationalPolicies = {
      ...operationalPolicies,
      operatingHours: branchIds.map((branchId) => operationalPolicies.operatingHours.find((schedule) => schedule.branchId === branchId) ?? { branchId, days: defaultOperatingDays() }),
      trialSchedules: branchIds.map((branchId) => {
        const schedule = operationalPolicies.trialSchedules.find((candidate) => candidate.branchId === branchId);
        return schedule ? { ...schedule, days: normalizedTrialDays(schedule.days) } : { branchId, days: defaultTrialDays() };
      }),
    };
    setPolicies(next);
    setBaseline(next);
  }, [settingsQuery.data]);

  const discard = useCallback(() => {
    if (baseline) setPolicies(baseline);
  }, [baseline]);
  const markSaved = useCallback((value: OperationalPolicies) => setBaseline(value), []);

  return { settingsQuery, policies, setPolicies, dirty, discard, markSaved };
}

function NumberSetting({ label, unit, className, ...props }: ComponentProps<typeof Input> & { label: string; unit: string }) {
  return (
    <Field label={label}>
      <div className="relative">
        <Input {...props} type="number" aria-label={`${label}, ${unit}`} className={cn("pe-16", className)} />
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[11px] text-ink-3" aria-hidden>{unit}</span>
      </div>
    </Field>
  );
}

function CompactToggle({ label, checked, onCheckedChange, disabled }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[12px] font-medium text-ink-2">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </label>
  );
}

function SectionLead({ title, description, toggle }: { title: string; description: string; toggle?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        <p className="mt-1 max-w-2xl text-[11.5px] leading-5 text-ink-3">{description}</p>
      </div>
      {toggle}
    </div>
  );
}

export function OperationalRulesSection() {
  const invalidate = useInvalidate();
  const plansQuery = useApiQuery(qk.plans({ status: "active" }), (api) => api.listPlans({ status: "active", pageSize: 100 }));
  const { settingsQuery, policies, setPolicies, dirty, discard, markSaved } = useOperationalPoliciesDraft();
  const save = useApiMutation((api, value: OperationalPolicies) => api.updateOperationalPolicies(value), {
    onSuccess: async () => {
      toast.success("Operational rules saved and audited.");
      await invalidate([qk.settings, qk.renewalQueue({}), qk.checkIns({}), qk.customerClasses("all")]);
    },
    onError: (error) => toast.error(isApiError(error) ? error.message : "Could not save operational rules."),
  });

  if (settingsQuery.isLoading || !policies) return <Skeleton className="h-96 w-full" />;
  if (settingsQuery.isError) return <ErrorState onRetry={() => settingsQuery.refetch()} />;

  const updateEntry = <K extends keyof OperationalPolicies["entry"]>(key: K, value: OperationalPolicies["entry"][K]) =>
    setPolicies((current) => current ? { ...current, entry: { ...current.entry, [key]: value } } : current);
  const updateReferrals = <K extends keyof OperationalPolicies["referrals"]>(key: K, value: OperationalPolicies["referrals"][K]) =>
    setPolicies((current) => current ? { ...current, referrals: { ...current.referrals, [key]: value } } : current);
  const updateFreezes = <K extends keyof OperationalPolicies["memberFreezes"]>(key: K, value: OperationalPolicies["memberFreezes"][K]) =>
    setPolicies((current) => current ? { ...current, memberFreezes: { ...current.memberFreezes, [key]: value } } : current);
  const updateMembership = <K extends keyof OperationalPolicies["membership"]>(key: K, value: OperationalPolicies["membership"][K]) =>
    setPolicies((current) => current ? { ...current, membership: { ...current.membership, [key]: value } } : current);
  const updateClassBooking = <K extends keyof OperationalPolicies["classBooking"]>(key: K, value: OperationalPolicies["classBooking"][K]) =>
    setPolicies((current) => current ? { ...current, classBooking: { ...current.classBooking, [key]: value } } : current);
  const updateRetention = <K extends keyof OperationalPolicies["retention"]>(key: K, value: OperationalPolicies["retention"][K]) =>
    setPolicies((current) => current ? { ...current, retention: { ...current.retention, [key]: value } } : current);
  const commit = async () => {
    await save.mutateAsync(policies);
    markSaved(policies);
  };

  return (
    <div className="mx-auto max-w-5xl pb-4">
      <div className="space-y-4">
        <SettingsPanel title="Entry and access" description="Rules Convex checks for every QR scan and manual check-in.">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Outstanding balance">
              <Select value={policies.entry.outstandingBalance} onValueChange={(value) => updateEntry("outstandingBalance", value as OperationalPolicies["entry"]["outstandingBalance"])}>
                <SelectTrigger aria-label="Outstanding balance policy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow silently</SelectItem>
                  <SelectItem value="warn">Allow with warning</SelectItem>
                  <SelectItem value="block">Block entry</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <NumberSetting label="Expiry warning" unit="days" min={0} max={30} value={policies.entry.expiryWarningDays} onChange={(event) => updateEntry("expiryWarningDays", Number(event.target.value))} />
            <NumberSetting label="Duplicate scan window" unit="min" min={1} max={15} value={policies.entry.duplicateScanWindowMinutes} onChange={(event) => updateEntry("duplicateScanWindowMinutes", Number(event.target.value))} />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div><p className="text-[13px] font-medium text-ink">Enforce branch hours</p><p className="mt-0.5 text-[11.5px] text-ink-3">Outside-hours entries require a manager override.</p></div>
            <Switch checked={policies.entry.enforceOperatingHours} onCheckedChange={(value) => updateEntry("enforceOperatingHours", value)} aria-label="Enforce branch hours" />
          </div>
        </SettingsPanel>

        <SettingsPanel
          title="Class booking"
          description="Control self-booking, plan eligibility, waitlists, and attendance follow-up."
          control={<CompactToggle label="Member booking" checked={policies.classBooking.enabled} onCheckedChange={(value) => updateClassBooking("enabled", value)} />}
        >
          <fieldset disabled={!policies.classBooking.enabled} className={cn("transition-opacity", !policies.classBooking.enabled && "opacity-55")}>
            <FieldGrid className="md:grid-cols-2 xl:grid-cols-4">
              <Field label="Membership eligibility">
                <Select value={policies.classBooking.eligibilityMode} onValueChange={(value) => updateClassBooking("eligibilityMode", value as OperationalPolicies["classBooking"]["eligibilityMode"])} disabled={!policies.classBooking.enabled}>
                  <SelectTrigger aria-label="Class membership eligibility"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all_active_memberships">All active memberships</SelectItem><SelectItem value="selected_plans">Only selected plans</SelectItem></SelectContent>
                </Select>
              </Field>
              <NumberSetting label="Booking horizon" unit="days" min={1} max={120} value={policies.classBooking.bookingHorizonDays} onChange={(event) => updateClassBooking("bookingHorizonDays", Number(event.target.value))} />
              <NumberSetting label="Cancellation cutoff" unit="hours" min={0} max={72} value={policies.classBooking.cancellationCutoffHours} onChange={(event) => updateClassBooking("cancellationCutoffHours", Number(event.target.value))} />
              <NumberSetting label="Active booking limit" unit="bookings" min={1} max={100} value={policies.classBooking.maxActiveBookingsPerMember} onChange={(event) => updateClassBooking("maxActiveBookingsPerMember", Number(event.target.value))} />
            </FieldGrid>
            {policies.classBooking.eligibilityMode === "selected_plans" ? (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-[12.5px] font-medium text-ink">Plans that include classes</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{plansQuery.data?.items.map((plan) => { const checked = policies.classBooking.eligiblePlanIds.includes(plan.id); return <label key={plan.id} className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md bg-sunken px-3 py-2 text-[12px]"><span>{plan.name}</span><Switch checked={checked} onCheckedChange={(value) => updateClassBooking("eligiblePlanIds", value ? [...policies.classBooking.eligiblePlanIds, plan.id] : policies.classBooking.eligiblePlanIds.filter((id) => id !== plan.id))} aria-label={`${plan.name} includes classes`} /></label>; })}</div>
              </div>
            ) : null}
            <div className="mt-5 grid gap-4 border-t border-line pt-4 md:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)] md:items-end">
              <div className="flex min-h-9 items-center justify-between gap-3"><div><p className="text-[13px] font-medium text-ink">Waitlist</p><p className="mt-0.5 text-[11.5px] text-ink-3">Promote the earliest waiting member automatically.</p></div><Switch checked={policies.classBooking.waitlistEnabled} onCheckedChange={(value) => updateClassBooking("waitlistEnabled", value)} aria-label="Class waitlist" /></div>
              <NumberSetting label="Waitlist limit" unit="members" min={1} max={200} value={policies.classBooking.waitlistSize} disabled={!policies.classBooking.waitlistEnabled} onChange={(event) => updateClassBooking("waitlistSize", Number(event.target.value))} />
              <div className="flex min-h-9 items-center justify-between gap-3"><div><p className="text-[13px] font-medium text-ink">Track no-shows</p><p className="mt-0.5 text-[11.5px] text-ink-3">Count only after attendance is finalized.</p></div><Switch checked={policies.classBooking.noShowTracking} onCheckedChange={(value) => updateClassBooking("noShowTracking", value)} aria-label="Track class no-shows" /></div>
            </div>
          </fieldset>
        </SettingsPanel>

        <SettingsPanel title="Membership and retention" description="Set the lifecycle guardrails and when the team should contact members.">
          <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-line rtl:lg:divide-x-reverse">
            <section>
              <SectionLead title="Retention radar" description="Create follow-ups for inactive, expiring, and recently expired members." />
              <FieldGrid className="sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <NumberSetting label="Inactive after" unit="days" min={3} max={180} value={policies.retention.inactivityDays} onChange={(event) => updateRetention("inactivityDays", Number(event.target.value))} />
                <NumberSetting label="Win-back window" unit="days" min={7} max={365} value={policies.retention.expiredWinBackDays} onChange={(event) => updateRetention("expiredWinBackDays", Number(event.target.value))} />
                <NumberSetting label="Default snooze" unit="days" min={1} max={90} value={policies.retention.defaultSnoozeDays} onChange={(event) => updateRetention("defaultSnoozeDays", Number(event.target.value))} />
              </FieldGrid>
            </section>
            <section className="border-t border-line pt-5 lg:border-t-0 lg:ps-6 lg:pt-0">
              <SectionLead title="Membership lifecycle" description="Guard sales, renewals, freezes, and sensitive date changes." />
              <FieldGrid className="sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <NumberSetting label="Renewal window" unit="days" min={1} max={90} value={policies.membership.renewalWindowDays} onChange={(event) => updateMembership("renewalWindowDays", Number(event.target.value))} />
                <NumberSetting label="Minimum freeze" unit="days" min={1} max={30} value={policies.membership.minimumFreezeDays} onChange={(event) => updateMembership("minimumFreezeDays", Number(event.target.value))} />
                <NumberSetting label="Maximum extension" unit="days" min={1} max={365} value={policies.membership.maximumExtensionDays} onChange={(event) => updateMembership("maximumExtensionDays", Number(event.target.value))} />
              </FieldGrid>
              <div className="mt-4 flex min-h-11 items-center justify-between gap-3 border-t border-line pt-4"><div><p className="text-[13px] font-medium text-ink">Overlapping memberships</p><p className="mt-0.5 text-[11.5px] text-ink-3">Keep off to prevent duplicate active terms.</p></div><Switch checked={policies.membership.allowOverlappingMemberships} onCheckedChange={(value) => updateMembership("allowOverlappingMemberships", value)} aria-label="Allow overlapping memberships" /></div>
            </section>
          </div>
        </SettingsPanel>

        <SettingsPanel title="Referrals and freeze requests" description="Member benefits stay visible here, with clear limits that staff cannot bypass.">
          <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-line rtl:lg:divide-x-reverse">
            <section>
              <SectionLead title="Referral rewards" description="Grant free membership days after a referred member buys their first term." toggle={<CompactToggle label="Reward referrals" checked={policies.referrals.enabled} onCheckedChange={(value) => updateReferrals("enabled", value)} />} />
              <fieldset disabled={!policies.referrals.enabled} className={cn("transition-opacity", !policies.referrals.enabled && "opacity-55")}>
                <FieldGrid className="sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <NumberSetting label="Reward" unit="days" min={1} max={90} value={policies.referrals.rewardDays} onChange={(event) => updateReferrals("rewardDays", Number(event.target.value))} />
                  <NumberSetting label="Member cap" unit="days" min={1} max={365} value={policies.referrals.maxRewardDaysPerWindow} onChange={(event) => updateReferrals("maxRewardDaysPerWindow", Number(event.target.value))} />
                  <NumberSetting label="Cap resets after" unit="days" min={7} max={365} value={policies.referrals.windowDays} onChange={(event) => updateReferrals("windowDays", Number(event.target.value))} />
                </FieldGrid>
              </fieldset>
            </section>
            <section className="border-t border-line pt-5 lg:border-t-0 lg:ps-6 lg:pt-0">
              <SectionLead title="Member freeze requests" description="Members request dates in their app. Staff still approve every request." toggle={<CompactToggle label="Accept requests" checked={policies.memberFreezes.requestsEnabled} onCheckedChange={(value) => updateFreezes("requestsEnabled", value)} />} />
              <fieldset disabled={!policies.memberFreezes.requestsEnabled} className={cn("transition-opacity", !policies.memberFreezes.requestsEnabled && "opacity-55")}>
                <FieldGrid className="sm:grid-cols-2">
                  <NumberSetting label="Free allowance" unit="freezes" min={0} max={12} value={policies.memberFreezes.freeFreezesPerWindow} onChange={(event) => updateFreezes("freeFreezesPerWindow", Number(event.target.value))} />
                  <NumberSetting label="Fee after allowance" unit="JOD" min={0} max={1000} step={0.5} value={policies.memberFreezes.extraFreezeFeeMinor / 1000} onChange={(event) => updateFreezes("extraFreezeFeeMinor", Math.round(Number(event.target.value) * 1000))} />
                  <NumberSetting label="Maximum length" unit="days" min={1} max={180} value={policies.memberFreezes.maxDaysPerFreeze} onChange={(event) => updateFreezes("maxDaysPerFreeze", Number(event.target.value))} />
                  <NumberSetting label="Allowance resets after" unit="days" min={30} max={730} value={policies.memberFreezes.windowDays} onChange={(event) => updateFreezes("windowDays", Number(event.target.value))} />
                </FieldGrid>
              </fieldset>
            </section>
          </div>
        </SettingsPanel>
      </div>
      <SettingsSaveBar dirty={dirty} saving={save.isPending} onSave={commit} onDiscard={discard} saveLabel="Save rules" />
    </div>
  );
}

export function HoursAndTrialsSection() {
  const invalidate = useInvalidate();
  const { settingsQuery, policies, setPolicies, dirty, discard, markSaved } = useOperationalPoliciesDraft();
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const save = useApiMutation((api, value: OperationalPolicies) => api.updateOperationalPolicies(value), {
    onSuccess: async () => {
      toast.success("Branch hours and trial windows saved.");
      await invalidate([qk.settings, qk.checkIns({}), qk.customerClasses("all")]);
    },
    onError: (error) => toast.error(isApiError(error) ? error.message : "Could not save branch hours."),
  });

  const branches = useMemo(() => settingsQuery.data?.branches?.filter((branch) => branch.status === "active") ?? [], [settingsQuery.data?.branches]);
  useEffect(() => {
    const branchIds = branches.map((branch) => branch.id);
    setSelectedBranchId((current) => branchIds.includes(current) ? current : "");
  }, [branches]);

  if (settingsQuery.isLoading || !policies) return <Skeleton className="h-96 w-full" />;
  if (settingsQuery.isError) return <ErrorState onRetry={() => settingsQuery.refetch()} />;

  const selectedSchedule = policies.operatingHours.find((schedule) => schedule.branchId === selectedBranchId);
  const selectedTrialSchedule = policies.trialSchedules.find((schedule) => schedule.branchId === selectedBranchId);
  const updateHours = (weekday: WeekdayKey, patch: Partial<OperationalPolicies["operatingHours"][number]["days"][WeekdayKey]>) =>
    setPolicies((current) => current ? { ...current, operatingHours: current.operatingHours.map((schedule) => schedule.branchId === selectedBranchId ? { ...schedule, days: { ...schedule.days, [weekday]: { ...schedule.days[weekday], ...patch } } } : schedule) } : current);
  const updateTrialWindow = (weekday: WeekdayKey, patch: Partial<OperationalPolicies["trialSchedules"][number]["days"][WeekdayKey]>) =>
    setPolicies((current) => current ? { ...current, trialSchedules: current.trialSchedules.map((schedule) => schedule.branchId === selectedBranchId ? { ...schedule, days: { ...schedule.days, [weekday]: { ...schedule.days[weekday], ...patch } } } : schedule) } : current);
  const commit = async () => {
    await save.mutateAsync(policies);
    markSaved(policies);
  };

  return (
    <div className="mx-auto max-w-6xl pb-4">
      <SettingsPanel
        title="Branch hours and free trials"
        description="Set one branch at a time. All times use the organization timezone."
        control={
          <Select value={selectedBranchId || "none"} onValueChange={(value) => setSelectedBranchId(value === "none" ? "" : value)}>
            <SelectTrigger className="w-56" aria-label="Branch schedule"><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent><SelectItem value="none">Choose a branch</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
          </Select>
        }
      >
        {selectedSchedule && selectedTrialSchedule ? (
          <div className="overflow-hidden rounded-md border border-line">
            <div className="hidden grid-cols-[150px_minmax(260px,1fr)_minmax(300px,1fr)] gap-5 bg-sunken px-4 py-2.5 text-[11px] font-medium text-ink-3 lg:grid">
              <span>Day</span><span>Branch hours</span><span>Free-trial requests</span>
            </div>
            <div className="divide-y divide-line">
              {WEEKDAY_ROWS.map(({ key, label }) => {
                const day = selectedSchedule.days[key];
                const trialWindow = selectedTrialSchedule.days[key];
                return (
                  <div key={key} className="grid gap-4 px-4 py-4 lg:grid-cols-[150px_minmax(260px,1fr)_minmax(300px,1fr)] lg:items-center lg:gap-5">
                    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink"><Checkbox checked={day.enabled} onCheckedChange={(value) => { const enabled = value === true; updateHours(key, { enabled }); if (!enabled) updateTrialWindow(key, { enabled: false }); }} aria-label={`${label} open`} />{label}</label>
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium text-ink-3 lg:hidden">Branch hours</p>
                      {day.enabled ? <div className="grid grid-cols-2 gap-2"><Input type="time" value={day.opensAt} onChange={(event) => updateHours(key, { opensAt: event.target.value })} aria-label={`${label} opening time`} /><Input type="time" value={day.closesAt} onChange={(event) => updateHours(key, { closesAt: event.target.value })} aria-label={`${label} closing time`} /></div> : <p className="flex min-h-9 items-center text-[12px] text-ink-3">Closed</p>}
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium text-ink-3 lg:hidden">Free-trial requests</p>
                      <div className="grid gap-2 sm:grid-cols-[112px_1fr] sm:items-center">
                        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[12px] font-medium text-ink-2"><Checkbox checked={trialWindow.enabled} disabled={!day.enabled} onCheckedChange={(value) => updateTrialWindow(key, { enabled: value === true })} aria-label={`${label} trial requests enabled`} />Offer trials</label>
                        {day.enabled && trialWindow.enabled ? <div className="grid grid-cols-2 gap-2"><Input type="time" min={day.opensAt} max={day.closesAt} value={trialWindow.opensAt} onChange={(event) => updateTrialWindow(key, { opensAt: event.target.value })} aria-label={`${label} trial window opening time`} /><Input type="time" min={day.opensAt} max={day.closesAt} value={trialWindow.closesAt} onChange={(event) => updateTrialWindow(key, { closesAt: event.target.value })} aria-label={`${label} trial window closing time`} /></div> : <span className="text-[12px] text-ink-3">{day.enabled ? "Not offered" : "Branch closed"}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : <p className="rounded-md border border-dashed border-line-2 px-5 py-12 text-center text-[12.5px] text-ink-3">{branches.length ? "Choose a branch to edit its hours and trial window." : "Create an active branch before setting hours."}</p>}
      </SettingsPanel>
      <SettingsSaveBar dirty={dirty} saving={save.isPending} onSave={commit} onDiscard={discard} saveLabel="Save hours" guardTitle="Unsaved hours and trial changes" />
    </div>
  );
}
