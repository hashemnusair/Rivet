"use client";
import { useFormat } from "@/lib/i18n/format";
import { readSettingsNumber } from "./settings-number";
import { useT } from "@/lib/i18n/provider";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
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
import { exponentFor, toWesternDigits } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_ROWS: Array<{ key: WeekdayKey }> = [
  { key: "sun" },
  { key: "mon" },
  { key: "tue" },
  { key: "wed" },
  { key: "thu" },
  { key: "fri" },
  { key: "sat" },
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

function useOperationalPoliciesDraft(extraDirty = false) {
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [policies, setPolicies] = useState<OperationalPolicies | null>(null);
  const [baseline, setBaseline] = useState<OperationalPolicies | null>(null);
  const dirty = Boolean(policies && baseline && policySnapshot(policies) !== policySnapshot(baseline));
  const dirtyRef = useRef(dirty || extraDirty);
  useEffect(() => { dirtyRef.current = dirty || extraDirty; }, [dirty, extraDirty]);

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

const NumberSettingValidity = createContext<((id: string, invalid: boolean) => void) | null>(null);

/** Keep incomplete and invalid drafts visible, without writing NaN or a coerced zero into a policy. */
function NumberSetting({ label, unit, hint, value, onValueChange, min, max, decimalPlaces = 0, ...props }: Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange" | "min" | "max" | "step"> & {
  label: string; unit: string; hint?: string; value: number; onValueChange: (value: number) => void;
  min: number; max: number; decimalPlaces?: number;
}) {
  const t = useT();
  const id = useId();
  const reportValidity = useContext(NumberSettingValidity);
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { setRaw(String(value)); }, [value]);
  const invalid = readSettingsNumber(raw, { min, max, decimalPlaces }) === null;
  useEffect(() => { reportValidity?.(id, invalid); }, [id, invalid, reportValidity]);
  useEffect(() => () => { reportValidity?.(id, false); }, [id, reportValidity]);
  const error = invalid ? decimalPlaces
    ? t("settingsDetails.decimalRange", { min, max, places: decimalPlaces })
    : t("operationsWorkspace.integerRange", { min, max }) : undefined;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <SettingsUnitInput {...props} id={id} type="text" inputMode={decimalPlaces ? "decimal" : "numeric"} dir="ltr" unit={unit} value={raw}
        aria-label={`${label}, ${unit}`} aria-invalid={invalid || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onChange={(event) => {
          const next = toWesternDigits(event.target.value);
          setRaw(next);
          const parsed = readSettingsNumber(next, { min, max, decimalPlaces });
          reportValidity?.(id, parsed === null);
          if (parsed !== null) onValueChange(parsed);
        }} />
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


export function OperationalRulesSection() {
  const t = useT();
  const f = useFormat();
  const RULES_DESCRIPTION = t("settingsDetails.text001");

  const invalidate = useInvalidate();
  const { session: rulesSession } = useApp();
  const currency = rulesSession?.organization.currency ?? "JOD";
  const plansQuery = useApiQuery(qk.plans({ status: "active" }), (api) => api.listPlans({ status: "active", pageSize: 100 }));
  const [invalidNumbers, setInvalidNumbers] = useState<Set<string>>(new Set());
  const { settingsQuery, policies, setPolicies, dirty, discard, markSaved } = useOperationalPoliciesDraft(invalidNumbers.size > 0);
  const [numberDraftRevision, setNumberDraftRevision] = useState(0);
  const reportNumberValidity = useCallback((id: string, invalid: boolean) => {
    setInvalidNumbers((current) => {
      if (current.has(id) === invalid) return current;
      const next = new Set(current);
      if (invalid) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const save = useApiMutation((api, value: OperationalPolicies) => api.updateOperationalPolicies(value), {
    onSuccess: async () => {
      toast.success(t("settingsDetails.text002"));
      await invalidate([qk.settings, qk.renewalQueue({}), qk.checkIns({}), qk.customerClasses("all")]);
    },
    onError: (error) => toast.error(isApiError(error) ? error.message : t("settingsDetails.text003")),
  });

  if (settingsQuery.isError) return <SettingsSection title={t("settingsCore.text191")} description={RULES_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;
  if (settingsQuery.isLoading || !policies) return <SettingsSection title={t("settingsCore.text191")} description={RULES_DESCRIPTION}><Skeleton className="h-96 w-full" /></SettingsSection>;

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
    if (invalidNumbers.size) return;
    await save.mutateAsync(policies);
    markSaved(policies);
  };
  const lastHourOptions = Array.from({ length: 24 }, (_, index) => index + 1);

  return (
    <SettingsSection title={t("settingsCore.text191")} description={RULES_DESCRIPTION}>
      <NumberSettingValidity.Provider value={reportNumberValidity}>
      <div key={numberDraftRevision} className="space-y-4">
        <SettingsPanel title={t("settingsDetails.text004")} description={t("settingsDetails.text005")}>
          <FieldGrid className="md:grid-cols-3">
            <Field label={t("settingsDetails.text006")} hint={t("settingsDetails.text007")}>
              <Select value={policies.entry.outstandingBalance} onValueChange={(value) => updateEntry("outstandingBalance", value as OperationalPolicies["entry"]["outstandingBalance"])}>
                <SelectTrigger aria-label={t("settingsDetails.text008")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">{t("settingsDetails.text009")}</SelectItem>
                  <SelectItem value="warn">{t("settingsDetails.text010")}</SelectItem>
                  <SelectItem value="block">{t("settingsDetails.text011")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <NumberSetting label={t("settingsDetails.text012")} unit={t("settingsDetails.unitDays")} hint={t("settingsDetails.text013")} min={0} max={30} value={policies.entry.expiryWarningDays} onValueChange={(value) => updateEntry("expiryWarningDays", value)} />
            <NumberSetting label={t("settingsDetails.text014")} unit={t("settingsDetails.unitMinutes")} hint={t("settingsDetails.text015")} min={1} max={15} value={policies.entry.duplicateScanWindowMinutes} onValueChange={(value) => updateEntry("duplicateScanWindowMinutes", value)} />
          </FieldGrid>
          <div className="mt-4 border-t border-line">
            <SettingsToggleRow label={t("settingsDetails.text016")} hint={t("settingsDetails.text017")} checked={policies.entry.enforceOperatingHours} onCheckedChange={(value) => updateEntry("enforceOperatingHours", value)} />
          </div>
        </SettingsPanel>

        <SettingsPanel
          title={t("settingsDetails.text018")}
          description={t("settingsDetails.text019")}
          control={<HeaderToggle label={t("settingsDetails.text020")} checked={policies.classBooking.enabled} onCheckedChange={(value) => updateClassBooking("enabled", value)} />}
        >
          <Governed enabled={policies.classBooking.enabled}>
            <FieldGrid className="md:grid-cols-2 xl:grid-cols-4">
              <Field label={t("settingsDetails.text021")}>
                <Select value={policies.classBooking.eligibilityMode} onValueChange={(value) => updateClassBooking("eligibilityMode", value as OperationalPolicies["classBooking"]["eligibilityMode"])} disabled={!policies.classBooking.enabled}>
                  <SelectTrigger aria-label={t("settingsDetails.text022")}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all_active_memberships">{t("settingsDetails.text023")}</SelectItem><SelectItem value="selected_plans">{t("settingsDetails.text024")}</SelectItem></SelectContent>
                </Select>
              </Field>
              <NumberSetting label={t("settingsDetails.text025")} unit={t("settingsDetails.unitDays")} min={1} max={120} value={policies.classBooking.bookingHorizonDays} onValueChange={(value) => updateClassBooking("bookingHorizonDays", value)} />
              <NumberSetting label={t("settingsDetails.text026")} unit={t("settingsDetails.unitHours")} min={0} max={72} value={policies.classBooking.cancellationCutoffHours} onValueChange={(value) => updateClassBooking("cancellationCutoffHours", value)} />
              <NumberSetting label={t("settingsDetails.text027")} unit={t("settingsDetails.unitBookings")} min={1} max={100} value={policies.classBooking.maxActiveBookingsPerMember} onValueChange={(value) => updateClassBooking("maxActiveBookingsPerMember", value)} />
            </FieldGrid>
            {policies.classBooking.eligibilityMode === "selected_plans" ? (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-[13.5px] font-medium text-ink">{t("settingsDetails.text028")}</p>
                <p className="mt-0.5 text-[12px] leading-5 text-ink-3">{t("settingsDetails.text029")}</p>
                <div className="mt-2 divide-y divide-line sm:grid sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0 lg:grid-cols-3">
                  {plansQuery.data?.items.map((plan) => (
                    <SettingsToggleRow key={plan.id} label={plan.name} checked={policies.classBooking.eligiblePlanIds.includes(plan.id)} onCheckedChange={(value) => updateClassBooking("eligiblePlanIds", value ? [...policies.classBooking.eligiblePlanIds, plan.id] : policies.classBooking.eligiblePlanIds.filter((id) => id !== plan.id))} />
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-5 grid gap-x-8 border-t border-line pt-1 lg:grid-cols-2">
              <div className="divide-y divide-line">
                <SettingsToggleRow label={t("settingsDetails.text030")} hint={t("settingsDetails.text031")} checked={policies.classBooking.waitlistEnabled} onCheckedChange={(value) => updateClassBooking("waitlistEnabled", value)} />
                <div className="py-3">
                  <NumberSetting label={t("settingsDetails.text032")} unit={t("settingsDetails.unitMembers")} className="max-w-56" min={1} max={200} value={policies.classBooking.waitlistSize} disabled={!policies.classBooking.waitlistEnabled} onValueChange={(value) => updateClassBooking("waitlistSize", value)} />
                </div>
              </div>
              <div className="divide-y divide-line">
                <SettingsToggleRow label={t("settingsDetails.text033")} hint={t("settingsDetails.text034")} checked={policies.classBooking.noShowTracking} onCheckedChange={(value) => updateClassBooking("noShowTracking", value)} />
                <div className="py-3">
                  <p className="text-[13px] font-medium text-ink">{t("settingsDetails.text035")}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-ink-3">{t("settingsDetails.text036")}</p>
                  <FieldGrid className="mt-2 grid-cols-2">
                    <Field label={t("settingsDetails.text037")}>
                      <Select value={policies.classBooking.calendarStartHour === undefined ? "auto" : String(policies.classBooking.calendarStartHour)} onValueChange={(value) => updateClassBooking("calendarStartHour", value === "auto" ? undefined : Number(value))} disabled={!policies.classBooking.enabled}>
                        <SelectTrigger aria-label={t("settingsDetails.text038")}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">{t("settingsDetails.text039")}</SelectItem>
                          {Array.from({ length: 24 }, (_, hour) => <SelectItem key={hour} value={String(hour)}>{hour === 24 ? t("settingsDetails.midnightNext") : f.clock(`${String(hour).padStart(2, "0")}:00`)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={t("settingsDetails.text040")}>
                      <Select value={policies.classBooking.calendarEndHour === undefined ? "auto" : String(policies.classBooking.calendarEndHour)} onValueChange={(value) => updateClassBooking("calendarEndHour", value === "auto" ? undefined : Number(value))} disabled={!policies.classBooking.enabled}>
                        <SelectTrigger aria-label={t("settingsDetails.text041")}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">{t("settingsDetails.text039")}</SelectItem>
                          {lastHourOptions.map((hour) => <SelectItem key={hour} value={String(hour)}>{hour === 24 ? t("settingsDetails.midnightNext") : f.clock(`${String(hour).padStart(2, "0")}:00`)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </FieldGrid>
                </div>
              </div>
            </div>
          </Governed>
        </SettingsPanel>

        <SettingsPanel title={t("settingsDetails.text042")} description={t("settingsDetails.text043")}>
          <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-line rtl:lg:divide-x-reverse">
            <section>
              <SectionLead title={t("settingsDetails.text044")} description={t("settingsDetails.text045")} />
              <FieldGrid className="sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <NumberSetting label={t("settingsDetails.text046")} unit={t("settingsDetails.unitDays")} min={3} max={180} value={policies.retention.inactivityDays} onValueChange={(value) => updateRetention("inactivityDays", value)} />
                <NumberSetting label={t("settingsDetails.text047")} unit={t("settingsDetails.unitDays")} min={7} max={365} value={policies.retention.expiredWinBackDays} onValueChange={(value) => updateRetention("expiredWinBackDays", value)} />
                <NumberSetting label={t("settingsDetails.text048")} unit={t("settingsDetails.unitDays")} min={1} max={90} value={policies.retention.defaultSnoozeDays} onValueChange={(value) => updateRetention("defaultSnoozeDays", value)} />
              </FieldGrid>
            </section>
            <section className="border-t border-line pt-5 lg:border-t-0 lg:ps-6 lg:pt-0">
              <SectionLead title={t("settingsDetails.text049")} description={t("settingsDetails.text050")} />
              <FieldGrid className="sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <NumberSetting label={t("settingsDetails.text051")} unit={t("settingsDetails.unitDays")} hint={t("settingsDetails.text052")} min={1} max={90} value={policies.membership.renewalWindowDays} onValueChange={(value) => updateMembership("renewalWindowDays", value)} />
                <NumberSetting label={t("settingsDetails.text053")} unit={t("settingsDetails.unitDays")} min={1} max={30} value={policies.membership.minimumFreezeDays} onValueChange={(value) => updateMembership("minimumFreezeDays", value)} />
                <NumberSetting label={t("settingsDetails.text054")} unit={t("settingsDetails.unitDays")} min={1} max={365} value={policies.membership.maximumExtensionDays} onValueChange={(value) => updateMembership("maximumExtensionDays", value)} />
              </FieldGrid>
              <div className="mt-3 border-t border-line">
                <SettingsToggleRow label={t("settingsDetails.text055")} hint={t("settingsDetails.text056")} checked={policies.membership.allowOverlappingMemberships} onCheckedChange={(value) => updateMembership("allowOverlappingMemberships", value)} />
              </div>
            </section>
          </div>
        </SettingsPanel>

        <SettingsPanel title={t("settingsDetails.text057")} description={t("settingsDetails.text058")}>
          <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-line rtl:lg:divide-x-reverse">
            <section>
              <SectionLead title={t("settingsDetails.text059")} description={t("settingsDetails.text060")} toggle={<HeaderToggle label={t("settingsDetails.text061")} checked={policies.referrals.enabled} onCheckedChange={(value) => updateReferrals("enabled", value)} />} />
              <Governed enabled={policies.referrals.enabled}>
                <FieldGrid className="sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <NumberSetting label={t("settingsDetails.text062")} unit={t("settingsDetails.unitDays")} min={1} max={90} value={policies.referrals.rewardDays} onValueChange={(value) => updateReferrals("rewardDays", value)} />
                  <NumberSetting label={t("settingsDetails.text063")} unit={t("settingsDetails.unitDays")} min={1} max={365} value={policies.referrals.maxRewardDaysPerWindow} onValueChange={(value) => updateReferrals("maxRewardDaysPerWindow", value)} />
                  <NumberSetting label={t("settingsDetails.text064")} unit={t("settingsDetails.unitDays")} min={7} max={365} value={policies.referrals.windowDays} onValueChange={(value) => updateReferrals("windowDays", value)} />
                </FieldGrid>
              </Governed>
            </section>
            <section className="border-t border-line pt-5 lg:border-t-0 lg:ps-6 lg:pt-0">
              <SectionLead title={t("settingsDetails.text065")} description={t("settingsDetails.text066")} toggle={<HeaderToggle label={t("settingsDetails.text067")} checked={policies.memberFreezes.requestsEnabled} onCheckedChange={(value) => updateFreezes("requestsEnabled", value)} />} />
              <Governed enabled={policies.memberFreezes.requestsEnabled}>
                <FieldGrid className="sm:grid-cols-2">
                  <NumberSetting label={t("settingsDetails.text068")} unit={t("settingsDetails.unitFreezes")} min={0} max={12} value={policies.memberFreezes.freeFreezesPerWindow} onValueChange={(value) => updateFreezes("freeFreezesPerWindow", value)} />
                  <NumberSetting label={t("settingsDetails.text069")} unit={currency} min={0} max={1000} decimalPlaces={exponentFor(currency)} value={policies.memberFreezes.extraFreezeFeeMinor / 10 ** exponentFor(currency)} onValueChange={(value) => updateFreezes("extraFreezeFeeMinor", Math.round(value * 10 ** exponentFor(currency)))} />
                  <NumberSetting label={t("settingsDetails.text070")} unit={t("settingsDetails.unitDays")} min={1} max={180} value={policies.memberFreezes.maxDaysPerFreeze} onValueChange={(value) => updateFreezes("maxDaysPerFreeze", value)} />
                  <NumberSetting label={t("settingsDetails.text071")} unit={t("settingsDetails.unitDays")} min={30} max={730} value={policies.memberFreezes.windowDays} onValueChange={(value) => updateFreezes("windowDays", value)} />
                </FieldGrid>
              </Governed>
            </section>
          </div>
        </SettingsPanel>
      </div>
      </NumberSettingValidity.Provider>
      <SettingsSaveBar
        dirty={dirty || invalidNumbers.size > 0}
        saving={save.isPending}
        saveDisabled={invalidNumbers.size > 0}
        saveDisabledReason={invalidNumbers.size ? t("settingsDetails.invalidNumbers") : undefined}
        error={save.isError ? (isApiError(save.error) ? save.error.message : t("settingsDetails.text072")) : undefined}
        onSave={commit}
        onDiscard={() => { discard(); setNumberDraftRevision((current) => current + 1); }}
        saveLabel={t("settingsDetails.text073")}
        guardTitle={t("settingsDetails.text074")}
      />
    </SettingsSection>
  );
}


export function HoursAndTrialsSection() {
  const t = useT();
  const HOURS_DESCRIPTION = t("settingsDetails.text075");

  const invalidate = useInvalidate();
  const { session } = useApp();
  const { settingsQuery, policies, setPolicies, dirty, discard, markSaved } = useOperationalPoliciesDraft();
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const save = useApiMutation((api, value: OperationalPolicies) => api.updateOperationalPolicies(value), {
    onSuccess: async () => {
      toast.success(t("settingsDetails.text076"));
      await invalidate([qk.settings, qk.checkIns({}), qk.customerClasses("all")]);
    },
    onError: (error) => toast.error(isApiError(error) ? error.message : t("settingsDetails.text077")),
  });

  const branches = useMemo(() => settingsQuery.data?.branches?.filter((branch) => branch.status === "active") ?? [], [settingsQuery.data?.branches]);
  useEffect(() => {
    const branchIds = branches.map((branch) => branch.id);
    setSelectedBranchId((current) => branchIds.includes(current)
      ? current
      : branchIds.includes(session?.activeBranchId ?? "") ? (session?.activeBranchId ?? "") : (branchIds[0] ?? ""));
  }, [branches, session?.activeBranchId]);

  if (settingsQuery.isError) return <SettingsSection title={t("settingsCore.text192")} description={HOURS_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;
  if (settingsQuery.isLoading || !policies) return <SettingsSection title={t("settingsCore.text192")} description={HOURS_DESCRIPTION}><Skeleton className="h-96 w-full" /></SettingsSection>;

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
    <SettingsSection title={t("settingsCore.text192")} description={HOURS_DESCRIPTION}>
      {branches.length === 0 ? (
        <EmptyState layout="section" title={t("settingsCore.text059")} description={t("settingsCore.text060")} />
      ) : (
        <SettingsPanel
          title={t("settingsDetails.text078")}
          description={selectedSchedule ? t("settingsDetails.weekSummary", { open: openDays, trial: trialDays }) : t("settingsDetails.text079")}
          bodyClassName="p-0"
          control={
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
              <span>{t("common.label.branch")}</span>
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger className="w-52" aria-label={t("settingsDetails.text080")}><SelectValue placeholder={t("renewFlow.adjust.transfer.chooseBranch")} /></SelectTrigger>
                <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
              </Select>
            </label>
          }
        >
          {selectedSchedule && selectedTrialSchedule ? (
            <div>
              <div className="hidden grid-cols-[150px_minmax(240px,1fr)_minmax(280px,1fr)] gap-5 border-b border-line bg-sunken/60 px-5 py-2 text-[12px] font-semibold text-ink-3 lg:grid">
                <span>{t("settingsDetails.text081")}</span><span>{t("settingsDetails.text082")}</span><span>{t("settingsDetails.text083")}</span>
              </div>
              <div className="divide-y divide-line">
                {WEEKDAY_ROWS.map(({ key }) => {
                  const label = { sun: t("errorValues.weekday.sunday"), mon: t("errorValues.weekday.monday"), tue: t("errorValues.weekday.tuesday"), wed: t("errorValues.weekday.wednesday"), thu: t("errorValues.weekday.thursday"), fri: t("errorValues.weekday.friday"), sat: t("errorValues.weekday.saturday") }[key];
                  const day = selectedSchedule.days[key];
                  const trialWindow = selectedTrialSchedule.days[key];
                  return (
                    <div key={key} className="grid gap-3 px-4 py-3 sm:px-5 lg:grid-cols-[150px_minmax(240px,1fr)_minmax(280px,1fr)] lg:items-center lg:gap-5">
                      <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[13.5px] font-semibold text-ink" data-touch-target><Checkbox checked={day.enabled} onCheckedChange={(value) => { const enabled = value === true; updateHours(key, { enabled }); if (!enabled) updateTrialWindow(key, { enabled: false }); }} aria-label={t("settingsDetails.dayOpen", { day: label })} />{label}<span className="text-[12px] font-normal text-ink-3 lg:hidden">{day.enabled ? t("settingsDetails.text084") : t("settingsDetails.text085")}</span></label>
                      <div>
                        <p className="mb-1 text-[12px] font-medium text-ink-3 lg:hidden">{t("settingsDetails.text082")}</p>
                        {day.enabled ? <div className="grid grid-cols-2 gap-2"><Input type="time" value={day.opensAt} onChange={(event) => updateHours(key, { opensAt: event.target.value })} aria-label={t("settingsDetails.dayStart", { day: label })} /><Input type="time" value={day.closesAt} onChange={(event) => updateHours(key, { closesAt: event.target.value })} aria-label={t("settingsDetails.dayEnd", { day: label })} /></div> : <p className="flex min-h-9 items-center text-[12.5px] text-ink-3">{t("settingsDetails.text086")}</p>}
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] font-medium text-ink-3 lg:hidden">{t("settingsDetails.text083")}</p>
                        <div className="grid gap-2 sm:grid-cols-[124px_1fr] sm:items-center">
                          <label className={cn("flex min-h-9 cursor-pointer items-center gap-2.5 text-[12.5px] font-medium text-ink-2", !day.enabled && "cursor-not-allowed text-ink-3")} data-touch-target><Checkbox checked={trialWindow.enabled} disabled={!day.enabled} onCheckedChange={(value) => updateTrialWindow(key, { enabled: value === true })} aria-label={t("settingsDetails.dayTrials", { day: label })} />{t("settingsDetails.text087")}</label>
                          {day.enabled && trialWindow.enabled ? <div className="grid grid-cols-2 gap-2"><Input type="time" min={day.opensAt} max={day.closesAt} value={trialWindow.opensAt} onChange={(event) => updateTrialWindow(key, { opensAt: event.target.value })} aria-label={t("settingsDetails.dayTrialStart", { day: label })} /><Input type="time" min={day.opensAt} max={day.closesAt} value={trialWindow.closesAt} onChange={(event) => updateTrialWindow(key, { closesAt: event.target.value })} aria-label={t("settingsDetails.dayTrialEnd", { day: label })} /></div> : <span className="flex min-h-9 items-center text-[12.5px] text-ink-3">{day.enabled ? t("settingsDetails.text088") : t("settingsDetails.text089")}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState layout="section" className="m-4 sm:m-5" title={t("renewFlow.adjust.transfer.chooseBranch")} description={t("settingsDetails.text090")} />
          )}
        </SettingsPanel>
      )}
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        error={save.isError ? (isApiError(save.error) ? save.error.message : t("settingsDetails.text091")) : undefined}
        onSave={commit}
        onDiscard={discard}
        saveLabel={t("settingsDetails.text092")}
        guardTitle={t("settingsDetails.text093")}
      />
    </SettingsSection>
  );
}
