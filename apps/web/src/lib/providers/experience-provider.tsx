"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getApi } from "@/lib/api/client";
import type { CustomerMembership, TrialBooking } from "@/lib/public/experience-data";
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

interface ExperienceContextValue {
  customerId?: string;
  customerSignedIn: boolean;
  platformAdminSignedIn: boolean;
  /** False until sessionStorage has been read, so guards do not bounce on first paint. */
  experienceReady: boolean;
  memberships: CustomerMembership[];
  bookings: TrialBooking[];
  signInCustomer: (customerId: string) => void;
  signOutCustomer: () => void;
  signInPlatformAdmin: () => void;
  signOutPlatformAdmin: () => void;
  bookTrial: (input: BookTrialInput) => Promise<TrialBooking>;
  customerMemberships: CustomerMembership[];
  customerBookings: TrialBooking[];
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

const STORAGE_KEYS = { customer: "rivet.demo.customer", admin: "rivet.demo.platformAdmin" } as const;

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [customerId, setCustomerId] = useState<string>();
  const [platformAdminSignedIn, setPlatformAdminSignedIn] = useState(false);
  const [experienceReady, setExperienceReady] = useState(false);
  const [memberships] = useState<CustomerMembership[]>(INITIAL_CUSTOMER_MEMBERSHIPS);
  const [bookings, setBookings] = useState<TrialBooking[]>(INITIAL_TRIAL_BOOKINGS);

  // A reload must not sign a member (or the platform admin) back out — the
  // route guards would otherwise bounce them straight to /login.
  useEffect(() => {
    const stored = window.sessionStorage.getItem(STORAGE_KEYS.customer);
    if (stored && CUSTOMER_PERSONAS.some((persona) => persona.id === stored)) setCustomerId(stored);
    if (window.sessionStorage.getItem(STORAGE_KEYS.admin) === "1") setPlatformAdminSignedIn(true);
    setExperienceReady(true);
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
      setBookings((current) => [booking, ...current]);
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
      memberships,
      bookings,
      signInCustomer: (id) => {
        if (!CUSTOMER_PERSONAS.some((persona) => persona.id === id)) return;
        window.sessionStorage.setItem(STORAGE_KEYS.customer, id);
        setCustomerId(id);
      },
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
    [bookTrial, bookings, customerBookings, customerId, customerMemberships, experienceReady, memberships, platformAdminSignedIn],
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience() {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience must be used inside ExperienceProvider");
  return value;
}

export function useCustomerPersona() {
  const { customerId } = useExperience();
  return CUSTOMER_PERSONAS.find((persona) => persona.id === customerId);
}

export function useMarketplaceGyms() {
  return MARKETPLACE_GYMS.filter((gym) => gym.subscriptionStatus === "active" || gym.subscriptionStatus === "trial");
}
