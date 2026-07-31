"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getApi } from "@/lib/api/client";
import type { CustomerMembership, CustomerPersona, TrialBooking } from "@/lib/public/experience-data";
import {
  CUSTOMER_PERSONAS,
  INITIAL_CUSTOMER_MEMBERSHIPS,
  INITIAL_TRIAL_BOOKINGS,
  MARKETPLACE_GYMS,
  gymById,
} from "@/lib/public/experience-data";

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
  /** Seeded preview accounts plus anything created through member sign-up. */
  customers: CustomerPersona[];
  memberships: CustomerMembership[];
  bookings: TrialBooking[];
  signInCustomer: (customerId: string) => void;
  registerCustomer: (input: RegisterCustomerInput) => CustomerPersona;
  emailTaken: (email: string) => boolean;
  signOutCustomer: () => void;
  signInPlatformAdmin: () => void;
  signOutPlatformAdmin: () => void;
  bookTrial: (input: BookTrialInput) => Promise<TrialBooking>;
  customerMemberships: CustomerMembership[];
  customerBookings: TrialBooking[];
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
  const [customerId, setCustomerId] = useState<string>();
  const [platformAdminSignedIn, setPlatformAdminSignedIn] = useState(false);
  const [experienceReady, setExperienceReady] = useState(false);
  const [registered, setRegistered] = useState<CustomerPersona[]>([]);
  const [memberships] = useState<CustomerMembership[]>(INITIAL_CUSTOMER_MEMBERSHIPS);
  const [bookings, setBookings] = useState<TrialBooking[]>(INITIAL_TRIAL_BOOKINGS);

  const customers = useMemo(() => [...registered, ...CUSTOMER_PERSONAS], [registered]);

  // A reload must not sign a member (or the platform admin) back out — the
  // route guards would otherwise bounce them straight to /login. Accounts made
  // through member sign-up are restored too, or the session would point at a
  // customer that no longer exists, and so are trial bookings, or a member who
  // just booked one comes back to an empty dashboard.
  useEffect(() => {
    const restored = readStored<CustomerPersona[]>(STORAGE_KEYS.registered) ?? [];
    if (restored.length > 0) setRegistered(restored);

    const storedBookings = readStored<TrialBooking[]>(STORAGE_KEYS.bookings);
    if (storedBookings?.length) setBookings(storedBookings);

    const stored = window.sessionStorage.getItem(STORAGE_KEYS.customer);
    const known = [...restored, ...CUSTOMER_PERSONAS];
    if (stored && known.some((persona) => persona.id === stored)) setCustomerId(stored);
    if (window.sessionStorage.getItem(STORAGE_KEYS.admin) === "1") setPlatformAdminSignedIn(true);
    setExperienceReady(true);
  }, []);

  const registerCustomer = useCallback((input: RegisterCustomerInput) => {
    const persona: CustomerPersona = {
      id: `customer-${Date.now()}`,
      name: input.fullName.trim(),
      nameAr: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      initials: initialsOf(input.fullName),
      context: "New member account",
    };
    setRegistered((current) => {
      const next = [persona, ...current];
      window.sessionStorage.setItem(STORAGE_KEYS.registered, JSON.stringify(next));
      return next;
    });
    window.sessionStorage.setItem(STORAGE_KEYS.customer, persona.id);
    setCustomerId(persona.id);
    return persona;
  }, []);

  const bookTrial = useCallback(
    async (input: BookTrialInput) => {
      const gym = gymById(input.gymId);
      const branch = gym?.branches.find((item) => item.id === input.branchId);
      let leadId: string | undefined;

      // Forge is the active GymOS demo tenant. Booking its free trial writes a
      // real lead into the existing mock CRM, so staff see it immediately.
      if (gym?.id === "forge-fitness" && branch?.internalBranchId) {
        const followUp = new Date(`${input.preferredDate}T${input.preferredTime}:00+03:00`).toISOString();
        const lead = await getApi().createLead({
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          branchId: branch.internalBranchId,
          source: "other",
          expectedValue: { amount: gym.fromPriceMinor, currency: "JOD" },
          nextFollowUpAt: followUp,
          notes: `Free trial requested through RIVET Member for ${branch.name}. Goal: ${input.goal}`,
        });
        await getApi().updateLead(lead.id, { stage: "trial_booked", nextFollowUpAt: followUp });
        leadId = lead.id;
      }

      const booking: TrialBooking = {
        id: `trial-${Date.now()}`,
        customerId,
        ...input,
        status: "requested",
        createdAt: new Date().toISOString(),
        leadId,
      };
      setBookings((current) => {
        const next = [booking, ...current];
        window.sessionStorage.setItem(STORAGE_KEYS.bookings, JSON.stringify(next));
        return next;
      });
      return booking;
    },
    [customerId],
  );

  const customerMemberships = useMemo(
    () => memberships.filter((membership) => membership.customerId === customerId),
    [customerId, memberships],
  );
  const customerBookings = useMemo(
    () => (customerId ? bookings.filter((booking) => booking.customerId === customerId) : []),
    [bookings, customerId],
  );

  const value = useMemo<ExperienceContextValue>(
    () => ({
      customerId,
      customerSignedIn: Boolean(customerId),
      platformAdminSignedIn,
      experienceReady,
      customers,
      memberships,
      bookings,
      signInCustomer: (id) => {
        if (!customers.some((persona) => persona.id === id)) return;
        window.sessionStorage.setItem(STORAGE_KEYS.customer, id);
        setCustomerId(id);
      },
      registerCustomer,
      emailTaken: (email) => customers.some((persona) => persona.email.toLowerCase() === email.trim().toLowerCase()),
      signOutCustomer: () => {
        window.sessionStorage.removeItem(STORAGE_KEYS.customer);
        setCustomerId(undefined);
      },
      signInPlatformAdmin: () => {
        window.sessionStorage.setItem(STORAGE_KEYS.admin, "1");
        setPlatformAdminSignedIn(true);
      },
      signOutPlatformAdmin: () => {
        window.sessionStorage.removeItem(STORAGE_KEYS.admin);
        setPlatformAdminSignedIn(false);
      },
      bookTrial,
      customerMemberships,
      customerBookings,
    }),
    [
      bookTrial,
      bookings,
      customerBookings,
      customerId,
      customerMemberships,
      customers,
      experienceReady,
      memberships,
      platformAdminSignedIn,
      registerCustomer,
    ],
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
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
  return MARKETPLACE_GYMS.filter((gym) => gym.subscriptionStatus === "active" || gym.subscriptionStatus === "trial");
}
