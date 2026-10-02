import { canonicalPhoneKey, DEFAULT_PHONE_COUNTRY_CALLING_CODE, phoneDigits, phoneSearchMatches } from "../utils/contact";

/** The identity fields a front-desk lookup may match on. */
export interface LookupCandidate {
  id: string;
  memberNumber: string;
  fullName: string;
  fullNameAr?: string;
  phone: string;
  email?: string;
  status: string;
}

export interface MemberLookupResolution<T extends LookupCandidate> {
  /** The one person the query unambiguously identifies, when there is one. */
  member?: T;
  /** Everyone the query could mean when it does not identify one person. */
  candidates: T[];
  /** True when the match came from a complete identifier (number or phone). */
  exact: boolean;
}

/** How many ambiguous matches the desk is shown before being asked to narrow the search. */
export const MAX_LOOKUP_CANDIDATES = 8;

function compact(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s-]/g, "");
}

function partialMatch(candidate: LookupCandidate, query: string, callingCode: string): boolean {
  const lowered = query.toLowerCase();
  const squeezed = compact(query);
  return [candidate.fullName, candidate.fullNameAr, candidate.phone, candidate.memberNumber, candidate.email].some((value) => {
    if (!value) return false;
    const text = value.toLowerCase();
    return text.includes(lowered) || compact(text).includes(squeezed) || phoneSearchMatches(value, lowered, callingCode);
  });
}

function rank(candidate: LookupCandidate): number {
  return candidate.status === "active" ? 0 : 1;
}

/**
 * Resolves a typed or scanned lookup to one person, or to the list of people
 * it could mean. A complete member number or a complete phone number wins
 * outright; anything shorter is a name-style search that must match exactly
 * one record before the desk sees a verdict. Both adapters use this so the
 * mock and Convex previews cannot pick different people for the same query.
 */
export function resolveMemberLookup<T extends LookupCandidate>(
  candidates: readonly T[],
  rawQuery: string,
  callingCode: string = DEFAULT_PHONE_COUNTRY_CALLING_CODE,
): MemberLookupResolution<T> {
  const query = rawQuery.trim();
  if (!query) return { candidates: [], exact: false };
  const squeezed = compact(query);
  const byNumber = candidates.filter((candidate) => compact(candidate.memberNumber) === squeezed);
  if (byNumber.length === 1) return { member: byNumber[0], candidates: byNumber, exact: true };

  // Seven digits is the shortest complete local number RIVET stores; shorter
  // digit runs are treated as partial searches rather than identities.
  if (phoneDigits(query).length >= 7) {
    const key = canonicalPhoneKey(query, callingCode);
    const byPhone = candidates.filter((candidate) => canonicalPhoneKey(candidate.phone, callingCode) === key);
    if (byPhone.length === 1) return { member: byPhone[0], candidates: byPhone, exact: true };
    if (byPhone.length > 1) return { candidates: sortCandidates(byPhone), exact: false };
  }

  const partial = candidates.filter((candidate) => partialMatch(candidate, query, callingCode));
  if (partial.length === 1) return { member: partial[0], candidates: partial, exact: false };
  return { candidates: sortCandidates(partial), exact: false };
}

function sortCandidates<T extends LookupCandidate>(items: T[]): T[] {
  return [...items].sort((left, right) => rank(left) - rank(right) || left.fullName.localeCompare(right.fullName) || left.memberNumber.localeCompare(right.memberNumber));
}
