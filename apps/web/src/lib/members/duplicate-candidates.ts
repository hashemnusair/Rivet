import { canonicalPhoneKey } from "../utils/contact";

export type DuplicateCandidateMember = {
  id: string;
  fullName?: string;
  phone?: string;
  email?: string;
  memberNumber?: string;
  status?: string;
  createdAt: number;
  updatedAt: number;
};

export type DuplicateCandidatePair = {
  id: string;
  primaryId: string;
  candidateId: string;
  reasons: Array<"phone" | "email" | "member_number" | "name_and_contact">;
  confidence: "strong" | "possible";
  createdAt: number;
  updatedAt: number;
};

function normalized(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/[\s+()\-]/g, "");
}

function pairId(leftId: string, rightId: string): string {
  return `duplicate:${[leftId, rightId].sort().join(":")}`;
}

/** Finds reviewable duplicate pairs in one pass over the member directory. */
export function buildDuplicateCandidatePairs(members: DuplicateCandidateMember[], countryCallingCode: string): DuplicateCandidatePair[] {
  const active = members.filter((member) => member.status !== "archived" && member.status !== "merged");
  const byId = new Map(active.map((member) => [member.id, member]));
  const firstByPhone = new Map<string, string>();
  const firstByEmail = new Map<string, string>();
  const firstByNumber = new Map<string, string>();
  const firstByNameContact = new Map<string, string>();
  const pairs = new Map<string, DuplicateCandidatePair>();

  const add = (firstId: string | undefined, member: DuplicateCandidateMember, reason: DuplicateCandidatePair["reasons"][number]) => {
    if (!firstId || firstId === member.id) return;
    const first = byId.get(firstId);
    if (!first) return;
    const id = pairId(first.id, member.id);
    const existing = pairs.get(id);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    pairs.set(id, {
      id,
      primaryId: first.id,
      candidateId: member.id,
      reasons: [reason],
      confidence: reason === "name_and_contact" ? "possible" : "strong",
      createdAt: Math.min(first.createdAt, member.createdAt),
      updatedAt: Math.max(first.updatedAt, member.updatedAt),
    });
  };

  for (const member of active) {
    const phone = canonicalPhoneKey(member.phone, countryCallingCode);
    const email = normalized(member.email);
    const memberNumber = normalized(member.memberNumber);
    const name = normalized(member.fullName);
    const contact = phone.slice(-7) || email;
    if (phone) {
      add(firstByPhone.get(phone), member, "phone");
      if (!firstByPhone.has(phone)) firstByPhone.set(phone, member.id);
    }
    if (email) {
      add(firstByEmail.get(email), member, "email");
      if (!firstByEmail.has(email)) firstByEmail.set(email, member.id);
    }
    if (memberNumber) {
      add(firstByNumber.get(memberNumber), member, "member_number");
      if (!firstByNumber.has(memberNumber)) firstByNumber.set(memberNumber, member.id);
    }
    if (name && contact) {
      const key = `${name}:${contact}`;
      add(firstByNameContact.get(key), member, "name_and_contact");
      if (!firstByNameContact.has(key)) firstByNameContact.set(key, member.id);
    }
  }

  return [...pairs.values()]
    .map((pair) => ({ ...pair, confidence: pair.reasons.some((reason) => reason !== "name_and_contact") ? "strong" as const : "possible" as const }))
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));
}
