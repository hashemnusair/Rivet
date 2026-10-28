"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { AiErrorCategory } from "@/lib/ai/contracts";
import type { ChatContextItem, ChatScreen } from "@/lib/ai/chat/contracts";
import { NAV_SECTIONS } from "@/components/shell/nav-config";
import { useLocale } from "@/lib/i18n/provider";
import { capabilityAvailable, useAiSettings } from "@/features/assist/use-assist";

/**
 * Ask RIVET's shared state: whether the panel is open, which conversation it
 * shows, how wide it is, and what the current screen contributes. Screens
 * register the record in focus, the things a person may want to attach and a
 * few questions worth asking there; everything else falls back to the
 * route's own name, so the assistant always knows where the person is.
 */

export interface AskRivetScreenRegistration {
  /** The page's own title, when the route name is too general (a member's name on their profile). */
  title?: string;
  /** The record the screen is about; attached to new messages until removed. */
  focus?: ChatContextItem;
  /** One-tap attachments offered above the message box. */
  suggestions?: ChatContextItem[];
  /** Questions worth asking on this screen, already in the person's language. */
  prompts?: string[];
}

export interface AskRivetScreen extends ChatScreen {
  focus?: ChatContextItem;
  suggestions: ChatContextItem[];
  prompts: string[];
}

interface AskRivetValue {
  available: boolean;
  blocked?: AiErrorCategory;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  chatId?: string;
  setChatId: (chatId: string | undefined) => void;
  screen: AskRivetScreen;
  register: (key: string, registration: AskRivetScreenRegistration) => void;
  unregister: (key: string) => void;
  /** A question to put in the box (from search or a suggestion), with a counter so the same text can be asked twice. */
  request?: { text: string; send: boolean; nonce: number };
  ask: (text: string, options?: { send?: boolean }) => void;
  width: number;
  setWidth: (width: number) => void;
}

const AskRivetContext = createContext<AskRivetValue | null>(null);

const OPEN_KEY = "rivet.askRivet.open";
const CHAT_KEY = "rivet.askRivet.chat";
const WIDTH_KEY = "rivet.askRivet.width";
export const PANEL_MIN_WIDTH = 360;
export const PANEL_MAX_WIDTH = 640;
export const PANEL_DEFAULT_WIDTH = 424;

function readStorage(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: "local" | "session", key: string, value: string | null): void {
  try {
    const target = storage === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) target.removeItem(key);
    else target.setItem(key, value);
  } catch {
    // Convenience only: the panel works without remembering its state.
  }
}

/** The route's own name from the navigation, longest match first. */
function useRouteTitle(pathname: string): string {
  const { t } = useLocale();
  return useMemo(() => {
    const items = NAV_SECTIONS.flatMap((section) => section.items).sort((a, b) => b.href.length - a.href.length);
    const match = items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match ? t(match.labelKey) : "RIVET";
  }, [pathname, t]);
}

export function AskRivetProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const settings = useAiSettings();
  const routeTitle = useRouteTitle(pathname);
  const [open, setOpenState] = useState(false);
  const [chatId, setChatIdState] = useState<string | undefined>(undefined);
  const [width, setWidthState] = useState(PANEL_DEFAULT_WIDTH);
  const [registrations, setRegistrations] = useState<Array<{ key: string; registration: AskRivetScreenRegistration }>>([]);
  const [request, setRequest] = useState<AskRivetValue["request"]>();
  const nonce = useRef(0);

  const available = capabilityAvailable(settings.data, "chat");
  const chat = settings.data?.capabilities.find((capability) => capability.key === "chat");
  const blocked: AiErrorCategory | undefined = !settings.data || available ? undefined : settings.data.globalStop ? "global_stop" : !settings.data.platformAvailable || settings.data.tenantMode === "off" ? "tenant_off" : chat?.effective === "off" ? "capability_off" : "ai_off";

  // Restore the panel after a reload, in the same tab.
  useEffect(() => {
    const savedWidth = Number(readStorage("local", WIDTH_KEY));
    if (savedWidth >= PANEL_MIN_WIDTH && savedWidth <= PANEL_MAX_WIDTH) setWidthState(savedWidth);
    if (readStorage("session", OPEN_KEY) === "1") setOpenState(true);
    const savedChat = readStorage("session", CHAT_KEY);
    if (savedChat) setChatIdState(savedChat);
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    writeStorage("session", OPEN_KEY, next ? "1" : null);
  }, []);
  const toggle = useCallback(() => setOpenState((current) => {
    writeStorage("session", OPEN_KEY, current ? null : "1");
    return !current;
  }), []);
  const setChatId = useCallback((next: string | undefined) => {
    setChatIdState(next);
    writeStorage("session", CHAT_KEY, next ?? null);
  }, []);
  const setWidth = useCallback((next: number) => {
    const clamped = Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, next)));
    setWidthState(clamped);
    writeStorage("local", WIDTH_KEY, String(clamped));
  }, []);

  const register = useCallback((key: string, registration: AskRivetScreenRegistration) => {
    setRegistrations((current) => [...current.filter((entry) => entry.key !== key), { key, registration }]);
  }, []);
  const unregister = useCallback((key: string) => {
    setRegistrations((current) => current.filter((entry) => entry.key !== key));
  }, []);

  const ask = useCallback((text: string, options?: { send?: boolean }) => {
    nonce.current += 1;
    setRequest({ text, send: Boolean(options?.send), nonce: nonce.current });
    setOpen(true);
  }, [setOpen]);

  // ⌘J / Ctrl+J opens and closes the panel from anywhere in the workspace.
  useEffect(() => {
    if (!available) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [available, toggle]);

  // The query string is read when a message is sent (see `currentRoute`), so the
  // shell needs no search-params boundary.
  const screen = useMemo<AskRivetScreen>(() => {
    const merged: AskRivetScreenRegistration = Object.assign({}, ...registrations.map((entry) => entry.registration));
    const suggestions = registrations.flatMap((entry) => entry.registration.suggestions ?? []);
    return {
      route: pathname,
      title: merged.title ?? routeTitle,
      ...(merged.focus ? { focus: merged.focus } : {}),
      suggestions,
      prompts: merged.prompts ?? [],
    };
  }, [pathname, registrations, routeTitle]);

  const value = useMemo<AskRivetValue>(() => ({ available, ...(blocked ? { blocked } : {}), open: open && available, setOpen, toggle, chatId, setChatId, screen, register, unregister, request, ask, width, setWidth }), [available, blocked, open, setOpen, toggle, chatId, setChatId, screen, register, unregister, request, ask, width, setWidth]);
  return <AskRivetContext.Provider value={value}>{children}</AskRivetContext.Provider>;
}

/** The route as the person sees it, with its filters, at the moment of sending. */
export function currentRoute(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return `${window.location.pathname}${window.location.search}`.slice(0, 300);
}

export function useAskRivet(): AskRivetValue | null {
  return useContext(AskRivetContext);
}

/**
 * Tells Ask RIVET what this screen is about. Call it once per screen with
 * values derived from what the screen already loaded; it updates as they
 * change and is withdrawn when the screen unmounts.
 */
export function useAskRivetScreen(registration: AskRivetScreenRegistration | undefined): void {
  const context = useContext(AskRivetContext);
  const key = useId();
  const serialized = registration ? JSON.stringify(registration) : "";
  const register = context?.register;
  const unregister = context?.unregister;
  useEffect(() => {
    if (!register || !unregister) return;
    if (!serialized) {
      unregister(key);
      return;
    }
    register(key, JSON.parse(serialized) as AskRivetScreenRegistration);
  }, [key, register, unregister, serialized]);
  useEffect(() => () => unregister?.(key), [key, unregister]);
}
