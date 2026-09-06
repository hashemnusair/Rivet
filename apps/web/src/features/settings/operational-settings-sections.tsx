"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox, Switch } from "@/components/ui/switch";
import { SettingsPanel, SettingsSaveBar, SettingsSection, SettingsToggleRow, SettingsUnitInput } from "@/features/settings/settings-layout";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { OperationalPolicies, WeekdayKey } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
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

/** A numeric rule with its unit inside the control: "Expiry warning" · 7 days. */
function NumberSetting({ label, unit, hint, ...props }: Omit<ComponentProps<typeof Input>, "type"> & { label: string; unit: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <SettingsUnitInput {...props} type="number" inputMode="numeric" unit={unit} aria-label={`${label}, ${unit}`} />
    </Field>
  );
}

/** A switch in a panel header that turns the fields beneath it on or off. */
function HeaderToggle({ label, checked, onCheckedChange, disabled }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2.5 text-[13px] font-medium text-ink">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </label>
  );
}

function SectionLead({ title, description, toggle }: { title: string; description: string; toggle?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-[13.5px] font-semibold text-ink">{title}</h4>
        <p className="mt-0.5 max-w-2xl text-[12px] leading-5 text-ink-3">{description}</p>
      </div>
      {toggle}
    </div>
  );
}

/** Fields that a header switch governs: still readable when off, clearly inactive. */
function Governed({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={!enabled} aria-disabled={!enabled} className={cn("min-w-0 transition-opacity", !enabled && "opacity-55")}>
      {children}
    </fieldset>
  );
}

const RULES_DESCRIPTION = "The rules the desk, the member app and the automations follow. They apply to every branch and are enforced by the server.";

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

  if (settingsQuery.isError) return <SettingsSection title="Operational rules" description={RULES_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;
  if (settingsQuery.isLoading || !policies) return <SettingsSection title="Operational rules" description={RULES_DESCRIPTION}><Skeleton className="h-96 w-full" /></SettingsSection>;

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
  const lastHourOptions = Array.from({ length: 24 }, (_, index) => index + 1);

  return (
    <SettingsSection title="Operational rules" description={RULES_DESCRIPTION}>
      <div className="space-y-4">
        <SettingsPanel title="Entry and access" description="Checked for every QR scan and manual check-in.">
          <FieldGrid className="md:grid-cols-3">
            <Field label="Outstanding balance" hint="What happens when a member with a balance due scans in.">
              <Select value={policies.entry.outstandingBalance} onValueChange={(value) => updateEntry("outstandingBalance", value as OperationalPolicies["entry"]["outstandingBalance"])}>
                <SelectTrigger aria-label="Outstanding balance policy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow silently</SelectItem>
                  <SelectItem value="warn">Allow with warning</SelectItem>
                  <SelectItem value="block">Block entry</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <NumberSetting label="Expiry warning" unit="days" hint="Warn the desk this many days before a membership ends." min={0} max={30} value={policies.entry.expiryWarningDays} onChange={(event) => updateEntry("expiryWarningDays", Number(event.target.value))} />
            <NumberSetting label="Duplicate scan window" unit="min" hint="A second scan inside this window is ignored." min={1} max={15} value={policies.entry.duplicateScanWindowMinutes} onChange={(event) => updateEntry("duplicateScanWindowMinutes", Number(event.target.value))} />
          </FieldGrid>
          <div className="mt-4 border-t border-line">
            <SettingsToggleRow label="Enforce branch hours" hint="Outside-hours entries require a manager override. Hours are set under Hours & trials." checked={policies.entry.enforceOperatingHours} onCheckedChange={(value) => updateEntry("enforceOperatingHours", value)} />
          </div>
        </SettingsPanel>

        <SettingsPanel
          title="Class booking"
          description="Self-booking from the member app, plan eligibility, waitlists and attendance follow-up."
          control={<HeaderToggle label="Member booking" checked={policies.classBooking.enabled} onCheckedChange={(value) => updateClassBooking("enabled", value)} />}
        >
          <Governed enabled={policies.classBooking.enabled}>
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
                <p className="text-[13.5px] font-medium text-ink">Plans that include classes</p>
                <p className="mt-0.5 text-[12px] leading-5 text-ink-3">Members on other plans can still be booked by staff.</p>
                <div className="mt-2 divide-y divide-line sm:grid sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0 lg:grid-cols-3">
                  {plansQuery.data?.items.map((plan) => (
                    <SettingsToggleRow key={plan.id} label={plan.name} checked={policies.classBooking.eligiblePlanIds.includes(plan.id)} onCheckedChange={(value) => updateClassBooking("eligiblePlanIds", value ? [...policies.classBooking.eligiblePlanIds, plan.id] : policies.classBooking.eligiblePlanIds.filter((id) => id !== plan.id))} />
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-5 grid gap-x-8 border-t border-line pt-1 lg:grid-cols-2">
              <div className="divide-y divide-line">
                <SettingsToggleRow label="Waitlist" hint="Promote the earliest waiting member automatically when a place opens." checked={policies.classBooking.waitlistEnabled} onCheckedChange={(value) => updateClassBooking("waitlistEnabled", value)} />
                <div className="py-3">
                  <NumberSetting label="Waitlist limit" unit="members" className="max-w-56" min={1} max={200} value={policies.classBooking.waitlistSize} disabled={!policies.classBooking.waitlistEnabled} onChange={(event) => updateClassBooking("waitlistSize", Number(event.target.value))} />
                </div>
              </div>
              <div className="divide-y divide-line">
                <SettingsToggleRow label="Track no-shows" hint="Count a no-show only after attendance is finalized." checked={policies.classBooking.noShowTracking} onCheckedChange={(value) => updateClassBooking("noShowTracking", value)} />
                <div className="py-3">
                  <p className="text-[13px] font-medium text-ink">Calendar hours</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-ink-3">The visible day on the classes calendar. Automatic hugs your first and last class.</p>
                  <FieldGrid className="mt-2 grid-cols-2">
                    <Field label="First hour">
                      <Select value={policies.classBooking.calendarStartHour === undefined ? "auto" : String(policies.classBooking.calendarStartHour)} onValueChange={(value) => updateClassBooking("calendarStartHour", value === "auto" ? undefined : Number(value))} disabled={!policies.classBooking.enabled}>
                        <SelectTrigger aria-label="Calendar first hour"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Automatic</SelectItem>
                          {Array.from({ length: 24 }, (_, hour) => <SelectItem key={hour} value={String(hour)}>{String(hour).padStart(2, "0")}:00</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Last hour">
                      <Select value={policies.classBooking.calendarEndHour === undefined ? "auto" : String(policies.classBooking.calendarEndHour)} onValueChange={(value) => updateClassBooking("calendarEndHour", value === "auto" ? undefined : Number(value))} disabled={!policies.classBooking.enabled}>
                        <SelectTrigger aria-label="Calendar last hour"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Automatic</SelectItem>
                          {lastHourOptions.map((hour) => <SelectItem key={hour} value={String(hour)}>{String(hour).padStart(2, "0")}:00</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </FieldGrid>
                </div>
              </div>
            </div>
          </Governed>
        </SettingsPanel>

        <SettingsPanel title="Membership and retention" description="Lifecycle guardrails, and when the team should contact members.">
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
              <div className="mt-3 border-t border-line">
                <SettingsToggleRow label="Overlapping memberships" hint="Keep off to prevent duplicate active terms." checked={policies.membership.allowOverlappingMemberships} onCheckedChange={(value) => updateMembership("allowOverlappingMemberships", value)} />
              </div>
            </section>
          </div>
        </SettingsPanel>

        <SettingsPanel title="Referrals and freeze requests" description="Member benefits stay visible here, with clear limits that staff cannot bypass.">
          <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-line rtl:lg:divide-x-reverse">
            <section>
              <SectionLead title="Referral rewards" description="Grant free membership days after a referred member buys their first term." toggle={<HeaderToggle label="Reward referrals" checked={policies.referrals.enabled} onCheckedChange={(value) => updateReferrals("enabled", value)} />} />
              <Governed enabled={policies.referrals.enabled}>
                <FieldGrid className="sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <NumberSetting label="Reward" unit="days" min={1} max={90} value={policies.referrals.rewardDays} onChange={(event) => updateReferrals("rewardDays", Number(event.target.value))} />
                  <NumberSetting label="Member cap" unit="days" min={1} max={365} value={policies.referrals.maxRewardDaysPerWindow} onChange={(event) => updateReferrals("maxRewardDaysPerWindow", Number(event.target.value))} />
                  <NumberSetting label="Cap resets after" unit="days" min={7} max={365} value={policies.referrals.windowDays} onChange={(event) => updateReferrals("windowDays", Number(event.target.value))} />
                </FieldGrid>
              </Governed>
            </section>
            <section className="border-t border-line pt-5 lg:border-t-0 lg:ps-6 lg:pt-0">
              <SectionLead title="Member freeze requests" description="Members request dates in their app. Staff still approve every request." toggle={<HeaderToggle label="Accept requests" checked={policies.memberFreezes.requestsEnabled} onCheckedChange={(value) => updateFreezes("requestsEnabled", value)} />} />
              <Governed enabled={policies.memberFreezes.requestsEnabled}>
                <FieldGrid className="sm:grid-cols-2">
                  <NumberSetting label="Free allowance" unit="freezes" min={0} max={12} value={policies.memberFreezes.freeFreezesPerWindow} onChange={(event) => updateFreezes("freeFreezesPerWindow", Number(event.target.value))} />
                  <NumberSetting label="Fee after allowance" unit="JOD" min={0} max={1000} step={0.5} value={policies.memberFreezes.extraFreezeFeeMinor / 1000} onChange={(event) => updateFreezes("extraFreezeFeeMinor", Math.round(Number(event.target.value) * 1000))} />
                  <NumberSetting label="Maximum length" unit="days" min={1} max={180} value={policies.memberFreezes.maxDaysPerFreeze} onChange={(event) => updateFreezes("maxDaysPerFreeze", Number(event.target.value))} />
                  <NumberSetting label="Allowance resets after" unit="days" min={30} max={730} value={policies.memberFreezes.windowDays} onChange={(event) => updateFreezes("windowDays", Number(event.target.value))} />
                </FieldGrid>
              </Governed>
            </section>
          </div>
        </SettingsPanel>
      </div>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        error={save.isError ? (isApiError(save.error) ? save.error.message : "The operational rules could not be saved. Try again.") : undefined}
        onSave={commit}
        onDiscard={discard}
        saveLabel="Save rules"
        guardTitle="Unsaved operational rules"
      />
    </SettingsSection>
  );
}

const HOURS_DESCRIPTION = "When each branch is open, and on which days visitors may request a free trial. Times follow the organization timezone.";

export function HoursAndTrialsSection() {
  const invalidate = useInvalidate();
  const { session } = useApp();
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
    setSelectedBranchId((current) => branchIds.includes(current)
      ? current
      : branchIds.includes(session?.activeBranchId ?? "") ? (session?.activeBranchId ?? "") : (branchIds[0] ?? ""));
  }, [branches, session?.activeBranchId]);

  if (settingsQuery.isError) return <SettingsSection title="Hours & trials" description={HOURS_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;
  if (settingsQuery.isLoading || !policies) return <SettingsSection title="Hours & trials" description={HOURS_DESCRIPTION}><Skeleton className="h-96 w-full" /></SettingsSection>;

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
  const openDays = selectedSchedule ? WEEKDAY_ROWS.filter(({ key }) => selectedSchedule.days[key].enabled).length : 0;
  const trialDays = selectedSchedule && selectedTrialSchedule ? WEEKDAY_ROWS.filter(({ key }) => selectedSchedule.days[key].enabled && selectedTrialSchedule.days[key].enabled).length : 0;

  return (
    <SettingsSection title="Hours & trials" description={HOURS_DESCRIPTION}>
      {branches.length === 0 ? (
        <EmptyState layout="section" title="No active branches" description="Add or reactivate a branch under Branches before setting its hours." />
      ) : (
        <SettingsPanel
          title="Branch hours and free trials"
          description={selectedSchedule ? `Open ${openDays} of 7 days · trials offered on ${trialDays}. Set one branch at a time; unsaved edits to other branches are kept until you save.` : "Set one branch at a time."}
          bodyClassName="p-0"
          control={
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
              <span>Branch</span>
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger className="w-52" aria-label="Branch schedule"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
              </Select>
            </label>
          }
        >
          {selectedSchedule && selectedTrialSchedule ? (
            <div>
              <div className="hidden grid-cols-[150px_minmax(240px,1fr)_minmax(280px,1fr)] gap-5 border-b border-line bg-sunken/60 px-5 py-2 text-[11.5px] font-semibold text-ink-3 lg:grid">
                <span>Day</span><span>Branch hours</span><span>Free-trial requests</span>
              </div>
              <div className="divide-y divide-line">
                {WEEKDAY_ROWS.map(({ key, label }) => {
                  const day = selectedSchedule.days[key];
                  const trialWindow = selectedTrialSchedule.days[key];
                  return (
                    <div key={key} className="grid gap-3 px-4 py-3 sm:px-5 lg:grid-cols-[150px_minmax(240px,1fr)_minmax(280px,1fr)] lg:items-center lg:gap-5">
                      <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[13.5px] font-semibold text-ink" data-touch-target><Checkbox checked={day.enabled} onCheckedChange={(value) => { const enabled = value === true; updateHours(key, { enabled }); if (!enabled) updateTrialWindow(key, { enabled: false }); }} aria-label={`${label} open`} />{label}<span className="text-[12px] font-normal text-ink-3 lg:hidden">{day.enabled ? "· open" : "· closed"}</span></label>
                      <div>
                        <p className="mb-1 text-[12px] font-medium text-ink-3 lg:hidden">Branch hours</p>
                        {day.enabled ? <div className="grid grid-cols-2 gap-2"><Input type="time" value={day.opensAt} onChange={(event) => updateHours(key, { opensAt: event.target.value })} aria-label={`${label} opening time`} /><Input type="time" value={day.closesAt} onChange={(event) => updateHours(key, { closesAt: event.target.value })} aria-label={`${label} closing time`} /></div> : <p className="flex min-h-9 items-center text-[12.5px] text-ink-3">Closed</p>}
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] font-medium text-ink-3 lg:hidden">Free-trial requests</p>
                        <div className="grid gap-2 sm:grid-cols-[124px_1fr] sm:items-center">
                          <label className={cn("flex min-h-9 cursor-pointer items-center gap-2.5 text-[12.5px] font-medium text-ink-2", !day.enabled && "cursor-not-allowed text-ink-3")} data-touch-target><Checkbox checked={trialWindow.enabled} disabled={!day.enabled} onCheckedChange={(value) => updateTrialWindow(key, { enabled: value === true })} aria-label={`${label} trial requests enabled`} />Offer trials</label>
                          {day.enabled && trialWindow.enabled ? <div className="grid grid-cols-2 gap-2"><Input type="time" min={day.opensAt} max={day.closesAt} value={trialWindow.opensAt} onChange={(event) => updateTrialWindow(key, { opensAt: event.target.value })} aria-label={`${label} trial window opening time`} /><Input type="time" min={day.opensAt} max={day.closesAt} value={trialWindow.closesAt} onChange={(event) => updateTrialWindow(key, { closesAt: event.target.value })} aria-label={`${label} trial window closing time`} /></div> : <span className="flex min-h-9 items-center text-[12.5px] text-ink-3">{day.enabled ? "Not offered" : "Branch closed"}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState layout="section" className="m-4 sm:m-5" title="Choose a branch" description="Pick a branch above to edit its hours and trial window." />
          )}
        </SettingsPanel>
      )}
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        error={save.isError ? (isApiError(save.error) ? save.error.message : "The branch hours could not be saved. Try again.") : undefined}
        onSave={commit}
        onDiscard={discard}
        saveLabel="Save hours"
        guardTitle="Unsaved hours and trial changes"
      />
    </SettingsSection>
  );
}
