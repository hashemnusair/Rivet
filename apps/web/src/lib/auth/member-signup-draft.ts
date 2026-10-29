/**
 * The details a new member typed on the sign-up form, kept for this browser
 * tab until their RIVET profile exists. Clerk activates the session before the
 * profile is saved, and a signed-in visitor is sent from the sign-up page to
 * the account resolver; the resolver saves these instead of asking again.
 * Never holds the password.
 */
export interface MemberSignupDraft {
  fullName: string;
  email: string;
  phone: string;
  gender: "female" | "male";
  /** Where sign-up was heading, such as a gym's join page. */
  returnTo?: string;
}

const KEY = "rivet:member-signup-draft";
/** Long enough for an email code to arrive; short enough not to outlive the sign-up. */
const MAX_AGE_MS = 60 * 60 * 1000;

export function saveMemberSignupDraft(draft: MemberSignupDraft, now = Date.now()): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...draft, email: draft.email.trim().toLowerCase(), savedAt: now }));
  } catch {
    // Storage can be unavailable (private mode); the profile form remains the fallback.
  }
}

/** The saved details for this signed-in email, if they are recent and complete. */
export function readMemberSignupDraft(email: string | undefined, now = Date.now()): MemberSignupDraft | undefined {
  if (!email) return undefined;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<MemberSignupDraft> & { savedAt?: number };
    if (typeof value.savedAt !== "number" || now - value.savedAt > MAX_AGE_MS) return undefined;
    if (value.email !== email.trim().toLowerCase()) return undefined;
    if (!value.fullName || !value.phone || (value.gender !== "female" && value.gender !== "male")) return undefined;
    return {
      fullName: value.fullName,
      email: value.email,
      phone: value.phone,
      gender: value.gender,
      ...(typeof value.returnTo === "string" && value.returnTo.startsWith("/") ? { returnTo: value.returnTo } : {}),
    };
  } catch {
    return undefined;
  }
}

export function clearMemberSignupDraft(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
