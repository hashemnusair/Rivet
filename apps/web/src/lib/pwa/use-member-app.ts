"use client";

import { useSyncExternalStore } from "react";
import {
  installPlatform,
  parseReminderState,
  reminderDue,
  REMINDER_STORAGE_KEY,
  snoozeReminder,
  type InstallPlatform,
  type ReminderState,
} from "./member-app-install";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type RelatedApp = { platform: string; url?: string };

export type MemberAppState = {
  /** False on the server and during hydration; nothing about the device is known yet. */
  ready: boolean;
  /** Opened from the home screen rather than a browser tab. */
  standalone: boolean;
  platform: InstallPlatform;
  /** The browser offered its own install prompt (Chrome, Edge, Samsung Internet). */
  canPrompt: boolean;
  /** The app is on this device: it installed here, Chrome reports it, or the member said so. */
  added: boolean;
  reminderDue: boolean;
};

const SERVER_STATE: MemberAppState = {
  ready: false,
  standalone: false,
  platform: { device: "computer", safari: false, inApp: false },
  canPrompt: false,
  added: false,
  reminderDue: false,
};

let installPrompt: InstallPromptEvent | undefined;
let relatedAppInstalled = false;
let relatedAppsChecked = false;
let snapshot: MemberAppState | undefined;
const listeners = new Set<() => void>();

function emit() {
  snapshot = undefined;
  for (const listener of listeners) listener();
}

function readReminder(): ReminderState {
  try {
    return parseReminderState(window.localStorage.getItem(REMINDER_STORAGE_KEY));
  } catch {
    return parseReminderState(null);
  }
}

function writeReminder(state: ReminderState) {
  try {
    window.localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private windows and blocked storage only lose the snooze; the bar still works.
  }
  emit();
}

function isStandalone() {
  const media = (query: string) => typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  return media("(display-mode: standalone)") || media("(display-mode: fullscreen)") || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// Chrome fires this once, soon after load, so it is caught as the module loads
// rather than when a component happens to mount. Only member pages link the
// manifest, so staff pages never see it.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = undefined;
    writeReminder({ ...readReminder(), added: true });
  });
}

function checkRelatedApps() {
  if (relatedAppsChecked) return;
  relatedAppsChecked = true;
  const lookup = (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<RelatedApp[]> }).getInstalledRelatedApps;
  if (typeof lookup !== "function") return;
  void lookup.call(navigator).then((apps) => {
    if (!apps.some((app) => app.platform === "webapp")) return;
    relatedAppInstalled = true;
    emit();
  }).catch(() => undefined);
}

function build(): MemberAppState {
  const reminder = readReminder();
  const added = Boolean(reminder.added) || relatedAppInstalled;
  return {
    ready: true,
    standalone: isStandalone(),
    platform: installPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    canPrompt: Boolean(installPrompt),
    added,
    reminderDue: !added && reminderDue(reminder, Date.now()),
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  checkRelatedApps();
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  snapshot ??= build();
  return snapshot;
}

export function useMemberApp(): MemberAppState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}

/** Shows the browser's own install prompt. Each prompt can be used once. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = installPrompt;
  if (!event) return "unavailable";
  installPrompt = undefined;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") writeReminder({ ...readReminder(), added: true });
  return outcome;
}

export function snoozeMemberAppReminder() {
  writeReminder(snoozeReminder(readReminder(), Date.now()));
}

export function markMemberAppAdded() {
  writeReminder({ ...readReminder(), added: true });
}

/** Test seam: forget module state between tests. */
export function resetMemberAppForTests() {
  installPrompt = undefined;
  relatedAppInstalled = false;
  relatedAppsChecked = false;
  emit();
}
