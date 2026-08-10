"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RefreshCcw } from "lucide-react";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";
import { getApi } from "@/lib/api/client";
import type { PlatformSaasPlan, PlatformSnapshot } from "@/lib/api/GymOSApi";
import { useRivetIdentity } from "@/lib/auth/rivet-identity";
import type { CustomerMembership, CustomerPersona, MarketplaceGym, TrialBooking } from "@/lib/public/experience-data";
import { platformTenantDirectoryGyms, publicMarketplaceGyms } from "@/lib/public/marketplace-filters";
import { refreshFailureState } from "@/lib/public/experience-refresh";
import {
  CUSTOMER_PERSONAS,
  INITIAL_CUSTOMER_MEMBERSHIPS,
  INITIAL_TRIAL_BOOKINGS,
  MARKETPLACE_GYMS,
} from "@/lib/public/experience-data";

export type ExperienceStatus = "loading" | "ready" | "error";

export interface BookTrialInput {
  gymId: string;
  branchId: string;
  fullName: string;
  email: string;
  phone: string;
  preferredDate: string;
  preferredTime: string;
  goal: string;
}

export interface RegisterCustomerInput {
  fullName: string;
  email: string;
  phone: string;
}

interface ExperienceContextValue {
  customerId?: string;
  customerSignedIn: boolean;
  platformAdminSignedIn: boolean;
  /** False until sessionStorage has been read, so guards do not bounce on first paint. */
  experienceReady: boolean;
  /** False until the preview session flags have been restored from sessionStorage. */
  previewSessionReady: boolean;
  experienceStatus: ExperienceStatus;
  experienceError?: string;
  /** True while a background refresh is checking the last rendered snapshot. */
  experienceRefreshing: boolean;
  retryExperience: () => void;
  /** Seeded preview accounts plus anything created through member sign-up. */
  customers: CustomerPersona[];
  memberships: CustomerMembership[];
  bookings: TrialBooking[];
  signInCustomer: (customerId: string) => void;
  registerCustomer: (input: RegisterCustomerInput) => Promise<CustomerPersona>;
  updateMarketingPreference: (optedIn: boolean) => Promise<CustomerPersona>;
  /** Signs in the authenticated person as themselves, creating their member profile once. */
  signInAsIdentity: (input: { email: string; fullName: string }) => Promise<CustomerPersona>;
  emailTaken: (email: string) => boolean;
  signOutCustomer: () => void;
  signInPlatformAdmin: () => void;
  signOutPlatformAdmin: () => void;
  bookTrial: (input: BookTrialInput) => Promise<TrialBooking>;
  customerMemberships: CustomerMembership[];
  customerBookings: TrialBooking[];
  marketplaceGyms: MarketplaceGym[];
  platformSnapshot?: PlatformSnapshot;
  saasPlans: PlatformSaasPlan[];
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

const STORAGE_KEYS = {
  customer: "rivet.demo.customer",
  admin: "rivet.demo.platformAdmin",
  registered: "rivet.demo.registeredCustomers",
  bookings: "rivet.demo.trialBookings",
} as const;

function readStored<T>(key: string): T | undefined {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const convexMode = isConvexMode();
  const identity = useRivetIdentity();
  const [customerId, setCustomerId] = useState<string>();
  const [platformAdminSignedIn, setPlatformAdminSignedIn] = useState(false);
  const [previewSessionReady, setPreviewSessionReady] = useState(convexMode);
  // Mock data is bundled and available synchronously. Starting it in a
  // loading state makes preview-only forms race the first client effect under
  // a cold Next dev server, while Convex genuinely needs an asynchronous load.
  const [experienceReady, setExperienceReady] = useState(!convexMode);
  const [experienceStatus, setExperienceStatus] = useState<ExperienceStatus>(convexMode ? "loading" : "ready");
  const [experienceError, setExperienceError] = useState<string>();
  const [experienceRefreshing, setExperienceRefreshing] = useState(false);
  const [experienceAttempt, setExperienceAttempt] = useState(0);
  const experienceHydratedRef = useRef(!convexMode);
  const [registered, setRegistered] = useState<CustomerPersona[]>([]);
  const [customer, setCustomer] = useState<CustomerPersona>();
  const [memberships, setMemberships] = useState<CustomerMembership[]>(convexMode ? [] : INITIAL_CUSTOMER_MEMBERSHIPS);
  const [bookings, setBookings] = useState<TrialBooking[]>(convexMode ? [] : INITIAL_TRIAL_BOOKINGS);
  const [marketplaceGyms, setMarketplaceGyms] = useState<MarketplaceGym[]>(convexMode ? [] : MARKETPLACE_GYMS);
  const [platformSnapshot, setPlatformSnapshot] = useState<PlatformSnapshot>();
  const [saasPlans, setSaasPlans] = useState<PlatformSaasPlan[]>([]);

  const customers = useMemo(() => {
    if (convexMode) return customer ? [customer] : [];
    const previewCustomers = [...registered, ...CUSTOMER_PERSONAS].filter((persona, index, all) => all.findIndex((candidate) => candidate.id === persona.id) === index);
    if (!customer) return previewCustomers;
    return [customer, ...previewCustomers.filter((persona) => persona.id !== customer.id)];
  }, [convexMode, customer, registered]);

  const retryExperience = useCallback(() => {
    setExperienceAttempt((attempt) => attempt + 1);
  }, []);

  // Mock mode restores its deterministic browser session. Convex mode loads
  // identity-linked records from the server and never uses sessionStorage as a
  // source of truth.
  useEffect(() => {
    if (convexMode) {
      setPreviewSessionReady(true);
      if (identity.status === "loading" || identity.status === "pending") {
        if (!experienceHydratedRef.current) {
          setExperienceStatus("loading");
          setExperienceReady(false);
        }
        return;
      }
      let cancelled = false;
      const hadRenderedData = experienceHydratedRef.current;
      if (!hadRenderedData) {
        setExperienceStatus("loading");
        setExperienceError(undefined);
        setExperienceReady(false);
      } else {
        // Keep the last good snapshot on screen during a refresh. A temporary
        // Convex/Clerk failure must not replace usable operational data with a
        // full-page error or force the operator to reload manually.
        setExperienceRefreshing(true);
      }
      const memberIdentity = identity.status === "ready" && !identity.platformAdmin && identity.memberships.length === 0;
      void Promise.all([
        getApi().listMarketplaceGyms(),
        getApi().listPublicSaasPlans(),
        memberIdentity ? getApi().getCustomerExperience() : Promise.resolve({ customer: undefined, memberships: [] as CustomerMembership[], bookings: [] as TrialBooking[] }),
        identity.status === "ready" && identity.platformAdmin ? getApi().getPlatformSnapshot() : Promise.resolve(undefined),
      ]).then(async ([gyms, plans, experience, platform]) => {
        if (cancelled) return;
        const hydratedMemberships = memberIdentity
          ? await Promise.all(experience.memberships.map(async (membership) => {
              if (membership.qrValue) return membership;
              try {
                const pass = await getApi().getEntryPass(membership.id);
                return { ...membership, qrValue: pass.token };
              } catch {
                return membership;
              }
            }))
          : experience.memberships;
        if (cancelled) return;
        setMarketplaceGyms(platform?.gyms ?? gyms);
        setSaasPlans(platform?.plans ?? plans);
        setMemberships(hydratedMemberships);
        setBookings(platform?.bookings ?? experience.bookings);
        setPlatformSnapshot(platform);
        setCustomer(experience.customer);
        setCustomerId(experience.customer?.id);
        setPlatformAdminSignedIn(identity.status === "ready" && identity.platformAdmin);
        setExperienceError(undefined);
        setExperienceRefreshing(false);
        setExperienceStatus("ready");
        setExperienceReady(true);
        experienceHydratedRef.current = true;
      }).catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error && error.message ? error.message : "RIVET could not load its live data.";
        const failure = refreshFailureState(hadRenderedData, message);
        setExperienceRefreshing(false);
        setExperienceError(failure.message);
        // Initial hydration still fails closed. Once a snapshot has rendered,
        // preserve it and expose a retryable stale-data notice instead.
        setExperienceStatus(failure.status);
      });
      return () => {
        cancelled = true;
      };
    }

    setPreviewSessionReady(false);
    const restored = readStored<CustomerPersona[]>(STORAGE_KEYS.registered) ?? [];
    void getApi().getPlatformSnapshot().then(setPlatformSnapshot).catch(() => undefined);
    void getApi().listPublicSaasPlans().then(setSaasPlans).catch(() => undefined);
    if (restored.length > 0) setRegistered(restored);

    const storedBookings = readStored<TrialBooking[]>(STORAGE_KEYS.bookings);
    if (storedBookings?.length) setBookings(storedBookings);

    const stored = window.sessionStorage.getItem(STORAGE_KEYS.customer);
    const known = [...restored, ...CUSTOMER_PERSONAS];
    if (stored && known.some((persona) => persona.id === stored)) setCustomerId(stored);
    if (window.sessionStorage.getItem(STORAGE_KEYS.admin) === "1") setPlatformAdminSignedIn(true);
    setExperienceError(undefined);
    setExperienceRefreshing(false);
    setExperienceStatus("ready");
    setExperienceReady(true);
    setPreviewSessionReady(true);
  }, [convexMode, experienceAttempt, identity.email, identity.fullName, identity.memberships.length, identity.platformAdmin, identity.status]);

  // My Gyms is the first member-facing surface moved from polling to a native
  // Convex query watch. The adapter owns the transport details; this provider
  // only applies the identity-scoped snapshot and keeps the existing QR
  // hydration/error semantics. Other operational surfaces intentionally keep
  // their bounded TanStack Query refresh until their own subscriptions land.
  useEffect(() => {
    const memberIdentity = identity.status === "ready" && !identity.platformAdmin && identity.memberships.length === 0;
    if (!convexMode || !memberIdentity) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const applySnapshot = async (experience: { customer?: CustomerPersona; memberships: CustomerMembership[]; bookings: TrialBooking[] }) => {
      const hydratedMemberships = await Promise.all(experience.memberships.map(async (membership) => {
        if (membership.qrValue) return membership;
        try {
          const pass = await getApi().getEntryPass(membership.id);
          return { ...membership, qrValue: pass.token };
        } catch {
          return membership;
        }
      }));
      if (cancelled) return;
      setMemberships(hydratedMemberships);
      setBookings(experience.bookings);
      setCustomer(experience.customer);
      setCustomerId(experience.customer?.id);
      setExperienceError(undefined);
      setExperienceRefreshing(false);
      setExperienceStatus("ready");
      setExperienceReady(true);
      experienceHydratedRef.current = true;
    };

    const handleSubscriptionError = (error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error && error.message ? error.message : "RIVET could not refresh member data.";
      const failure = refreshFailureState(experienceHydratedRef.current, message);
      setExperienceError(failure.message);
      setExperienceRefreshing(false);
      setExperienceStatus(failure.status);
      if (!experienceHydratedRef.current) setExperienceReady(false);
    };

    void getApi().subscribeCustomerExperience((experience) => {
      void applySnapshot(experience).catch(handleSubscriptionError);
    }, handleSubscriptionError).then((disposer) => {
      if (cancelled) disposer();
      else unsubscribe = disposer;
    }).catch(handleSubscriptionError);

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [convexMode, identity.memberships.length, identity.platformAdmin, identity.status]);

  /**
   * A real signed-in person is their own member, not one of the seeded
   * personas. Keyed on email so a reload or a second sign-in reuses the same
   * profile instead of stacking duplicates.
   */
  const signInAsIdentity = useCallback(async (input: { email: string; fullName: string }) => {
    if (convexMode) {
      const persona = await getApi().registerCustomer({ email: input.email, fullName: input.fullName, phone: "" });
      setCustomer(persona);
      setCustomerId(persona.id);
      return persona;
    }
    const id = `identity:${input.email.trim().toLowerCase()}`;
    const persona: CustomerPersona = {
      id,
      name: input.fullName.trim() || input.email,
      nameAr: input.fullName.trim() || input.email,
      email: input.email.trim().toLowerCase(),
      phone: "",
      initials: initialsOf(input.fullName || input.email),
      context: "Your RIVET account",
    };

    setRegistered((current) => {
      const next = [persona, ...current.filter((item) => item.id !== id)];
      window.sessionStorage.setItem(STORAGE_KEYS.registered, JSON.stringify(next));
      return next;
    });
    window.sessionStorage.setItem(STORAGE_KEYS.customer, id);
    setCustomerId(id);
    return persona;
  }, [convexMode]);

  const registerCustomer = useCallback(async (input: RegisterCustomerInput) => {
    if (convexMode) {
      const persona = await getApi().registerCustomer(input);
      setCustomer(persona);
      setCustomerId(persona.id);
      return persona;
    }
    const persona = await getApi().registerCustomer(input);
    setRegistered((current) => {
      const next = [persona, ...current];
      window.sessionStorage.setItem(STORAGE_KEYS.registered, JSON.stringify(next));
      return next;
    });
    window.sessionStorage.setItem(STORAGE_KEYS.customer, persona.id);
    setCustomerId(persona.id);
    return persona;
  }, [convexMode]);

  const updateMarketingPreference = useCallback(async (optedIn: boolean) => {
    const current = customer ?? customers.find((persona) => persona.id === customerId);
    const next = await getApi().updateCustomerMarketingPreference({ optedIn, customerId: current?.id });
    setCustomer(next);
    setCustomerId(next.id);
    if (!convexMode) {
      setRegistered((existing) => {
        const updated = [next, ...existing.filter((persona) => persona.id !== next.id)];
        window.sessionStorage.setItem(STORAGE_KEYS.registered, JSON.stringify(updated));
        window.sessionStorage.setItem(STORAGE_KEYS.customer, next.id);
        return updated;
      });
    }
    return next;
  }, [convexMode, customer, customerId, customers]);

  const bookTrial = useCallback(
    async (input: BookTrialInput) => {
      const booking = await getApi().createTrialBooking({ ...input, customerId });
      if (!customerId && booking.customerId) setCustomerId(booking.customerId);
      setBookings((current) => {
        const next = [booking, ...current.filter((item) => item.id !== booking.id)];
        if (!convexMode) window.sessionStorage.setItem(STORAGE_KEYS.bookings, JSON.stringify(next));
        return next;
      });
      return booking;
    },
    [convexMode, customerId],
  );

  const customerMemberships = useMemo(
    () => memberships.filter((membership) => membership.customerId === customerId),
    [customerId, memberships],
  );
  const customerBookings = useMemo(
    () => (customerId ? bookings.filter((booking) => booking.customerId === customerId) : []),
    [bookings, customerId],
  );

  // Keep auth actions referentially stable. Redirect effects depend on these
  // callbacks; recreating them whenever background data arrived used to cancel
  // the platform redirect timer halfway through a successful sign-in.
  const signInCustomer = useCallback((id: string) => {
    if (!customers.some((persona) => persona.id === id)) return;
    if (!convexMode) window.sessionStorage.setItem(STORAGE_KEYS.customer, id);
    setCustomerId(id);
  }, [convexMode, customers]);

  const signOutCustomer = useCallback(() => {
    if (!convexMode) window.sessionStorage.removeItem(STORAGE_KEYS.customer);
    setCustomerId(undefined);
  }, [convexMode]);

  const signInPlatformAdmin = useCallback(() => {
    if (!convexMode) window.sessionStorage.setItem(STORAGE_KEYS.admin, "1");
    setPlatformAdminSignedIn(true);
  }, [convexMode]);

  const signOutPlatformAdmin = useCallback(() => {
    if (!convexMode) window.sessionStorage.removeItem(STORAGE_KEYS.admin);
    setPlatformAdminSignedIn(false);
  }, [convexMode]);

  const value = useMemo<ExperienceContextValue>(
    () => ({
      customerId,
      customerSignedIn: Boolean(customerId),
      platformAdminSignedIn,
      previewSessionReady,
      experienceReady,
      experienceStatus,
      experienceError,
      experienceRefreshing,
      retryExperience,
      customers,
      memberships,
      bookings,
      signInCustomer,
      registerCustomer,
      updateMarketingPreference,
      signInAsIdentity,
      emailTaken: (email) => customers.some((persona) => persona.email.toLowerCase() === email.trim().toLowerCase()),
      signOutCustomer,
      signInPlatformAdmin,
      signOutPlatformAdmin,
      bookTrial,
      customerMemberships,
      customerBookings,
      marketplaceGyms,
      platformSnapshot,
      saasPlans,
    }),
    [
      bookTrial,
      bookings,
      customerBookings,
      experienceError,
      experienceRefreshing,
      experienceStatus,
      customerId,
      customerMemberships,
      customers,
      experienceReady,
      memberships,
      platformAdminSignedIn,
      previewSessionReady,
      retryExperience,
      registerCustomer,
      updateMarketingPreference,
      signInAsIdentity,
      signInCustomer,
      signOutCustomer,
      signInPlatformAdmin,
      signOutPlatformAdmin,
      marketplaceGyms,
      platformSnapshot,
      saasPlans,
    ],
  );

  const showStaleNotice = convexMode && experienceStatus === "ready" && Boolean(experienceError);

  return (
    <ExperienceContext.Provider value={value}>
      {showStaleNotice ? (
        <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-bg px-4 py-2 text-center text-[11.5px] text-warning-deep" role="status" aria-live="polite">
          <span>Showing the last known RIVET data while the live connection recovers.</span>
          <button type="button" onClick={retryExperience} className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline">
            <RefreshCcw className="size-3" aria-hidden /> Retry
          </button>
        </div>
      ) : null}
      {children}
    </ExperienceContext.Provider>
  );
}

export function useExperience() {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience must be used inside ExperienceProvider");
  return value;
}

export function useCustomerPersona() {
  const { customerId, customers } = useExperience();
  return customers.find((persona) => persona.id === customerId);
}

export function useMarketplaceGyms() {
  const { marketplaceGyms } = useExperience();
  return publicMarketplaceGyms(marketplaceGyms);
}

/**
 * Platform-only directory. Unlike member discovery, this must retain hidden,
 * suspended, overdue, and cancelled tenants so operators can restore or audit
 * them from the normal navigation.
 */
export function usePlatformGyms() {
  const { marketplaceGyms, platformSnapshot, platformAdminSignedIn } = useExperience();
  if (!platformAdminSignedIn) return [];
  return platformTenantDirectoryGyms(platformSnapshot?.gyms ?? marketplaceGyms);
}
