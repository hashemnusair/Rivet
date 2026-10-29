/**
 * Pure rules for putting the member app on a phone's home screen: which steps
 * fit this phone and browser, and when the reminder may ask again. The browser
 * glue lives in `use-member-app.ts`.
 */

export type InstallDevice = "iphone" | "android" | "computer";

export type InstallPlatform = {
  device: InstallDevice;
  /** Safari on an iPhone or iPad: Share sits in Safari's own toolbar. */
  safari: boolean;
  /** Instagram, Facebook, TikTok and other in-app browsers cannot add to the home screen. */
  inApp: boolean;
};

const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|musical_ly|BytedanceWebview|TikTok|Snapchat|LinkedInApp|Twitter for|MicroMessenger|GSA\//i;
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/i;

export function installPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  // iPadOS asks for the desktop site and reports itself as a Mac with touch.
  // Desktop Chrome with touch emulation also does that, but says Chrome.
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1 && !/Chrome\//.test(userAgent));
  if (ios) {
    // Every real iOS browser keeps Safari's token; app web views drop it.
    const inApp = IN_APP_BROWSER.test(userAgent) || !/Safari\//.test(userAgent);
    return { device: "iphone", safari: !inApp && !IOS_OTHER_BROWSER.test(userAgent), inApp };
  }
  if (/Android/.test(userAgent)) {
    return { device: "android", safari: false, inApp: IN_APP_BROWSER.test(userAgent) || /; wv\)/.test(userAgent) };
  }
  return { device: "computer", safari: false, inApp: false };
}

export const REMINDER_STORAGE_KEY = "rivet:member-app";

/** Each "Not now" waits longer, then the reminder settles at once a month. */
export const SNOOZE_DAYS = [3, 7, 14, 30] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ReminderState = {
  snoozes: number;
  /** ISO time before which the reminder stays hidden. */
  nextAt?: string;
  /** The app is on this device: it installed here, or the member said so. */
  added?: boolean;
};

export const EMPTY_REMINDER: ReminderState = { snoozes: 0 };

export function parseReminderState(raw: string | null | undefined): ReminderState {
  if (!raw) return EMPTY_REMINDER;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return EMPTY_REMINDER;
    const record = value as Record<string, unknown>;
    const snoozes = typeof record.snoozes === "number" && Number.isFinite(record.snoozes) && record.snoozes > 0 ? Math.floor(record.snoozes) : 0;
    const nextAt = typeof record.nextAt === "string" && !Number.isNaN(Date.parse(record.nextAt)) ? record.nextAt : undefined;
    return { snoozes, ...(nextAt ? { nextAt } : {}), ...(record.added === true ? { added: true } : {}) };
  } catch {
    return EMPTY_REMINDER;
  }
}

export function snoozeReminder(state: ReminderState, now: number): ReminderState {
  const days = SNOOZE_DAYS[Math.min(state.snoozes, SNOOZE_DAYS.length - 1)] ?? 30;
  return { ...state, snoozes: state.snoozes + 1, nextAt: new Date(now + days * DAY_MS).toISOString() };
}

export function reminderDue(state: ReminderState, now: number): boolean {
  if (state.added) return false;
  return !state.nextAt || Date.parse(state.nextAt) <= now;
}
