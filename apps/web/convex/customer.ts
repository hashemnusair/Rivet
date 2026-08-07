export interface CustomerIdentityInput {
  userId: string;
  email: string;
  fullName: string;
  phone?: string;
}

export interface CustomerProfileDraft {
  id: string;
  userId: string;
  name: string;
  nameAr: string;
  email: string;
  phone: string;
  initials: string;
  context: string;
}

/**
 * Builds the consumer profile from the authenticated identity. Display name
 * and phone may be edited by the member; email and user ownership never come
 * from the browser payload.
 */
export function buildCustomerProfileDraft(
  identity: CustomerIdentityInput,
  input: { fullName?: unknown; email?: unknown; phone?: unknown },
  id: string,
): CustomerProfileDraft {
  const fullName = (typeof input.fullName === "string" ? input.fullName.trim() : "") || identity.fullName.trim() || identity.email.trim();
  const email = identity.email.trim().toLowerCase();
  const phone = typeof input.phone === "string" ? input.phone.trim() : identity.phone?.trim() ?? "";
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return {
    id,
    userId: identity.userId,
    name: fullName,
    nameAr: fullName,
    email,
    phone,
    initials,
    context: "RIVET member",
  };
}

/** The owner of a trial is always the authenticated profile resolved server-side. */
export function customerProfileOwnership(userId: string, profileId: string): { customerUserId: string; customerId: string } {
  return { customerUserId: userId, customerId: profileId };
}

export function findCustomerProfileByUserId<T extends { userId?: string }>(profiles: readonly T[], userId: string): T | undefined {
  return profiles.find((profile) => profile.userId === userId);
}
