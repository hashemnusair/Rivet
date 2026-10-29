import { describe, expect, it } from "vitest";
import { installPlatform, parseReminderState, reminderDue, snoozeReminder } from "./member-app-install";

const USER_AGENTS = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85 (iPhone15,3; iOS 18_6; en_US)",
  iphoneFacebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101]",
  ipadDesktopSite: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  androidWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36",
  androidTikTok: "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 musical_ly_2024103030",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
};

describe("install platform", () => {
  it("gives iPhone Safari the Safari steps and other iPhone browsers the address-bar steps", () => {
    expect(installPlatform(USER_AGENTS.iphoneSafari, 5)).toEqual({ device: "iphone", safari: true, inApp: false });
    expect(installPlatform(USER_AGENTS.iphoneChrome, 5)).toEqual({ device: "iphone", safari: false, inApp: false });
  });

  it("treats an iPad asking for the desktop site as an iPhone-family device, not a Mac", () => {
    expect(installPlatform(USER_AGENTS.ipadDesktopSite, 5)).toEqual({ device: "iphone", safari: true, inApp: false });
    expect(installPlatform(USER_AGENTS.ipadDesktopSite, 0).device).toBe("computer");
    // A Mac running Chrome with touch emulation (local browser tests) stays a computer.
    expect(installPlatform(USER_AGENTS.macChrome, 5).device).toBe("computer");
  });

  it("sends members in Instagram, Facebook, TikTok and app web views to a real browser first", () => {
    expect(installPlatform(USER_AGENTS.iphoneInstagram, 5)).toMatchObject({ device: "iphone", inApp: true, safari: false });
    expect(installPlatform(USER_AGENTS.iphoneFacebook, 5)).toMatchObject({ device: "iphone", inApp: true });
    expect(installPlatform(USER_AGENTS.androidTikTok, 5)).toMatchObject({ device: "android", inApp: true });
    expect(installPlatform(USER_AGENTS.androidWebView, 5)).toMatchObject({ device: "android", inApp: true });
  });

  it("recognises Android browsers and computers", () => {
    expect(installPlatform(USER_AGENTS.androidChrome, 5)).toEqual({ device: "android", safari: false, inApp: false });
    expect(installPlatform(USER_AGENTS.androidSamsung, 5)).toEqual({ device: "android", safari: false, inApp: false });
    expect(installPlatform(USER_AGENTS.macChrome, 0).device).toBe("computer");
    expect(installPlatform(USER_AGENTS.windowsEdge, 0).device).toBe("computer");
  });
});

describe("install reminder schedule", () => {
  const now = Date.parse("2026-10-29T09:00:00Z");
  const day = 24 * 60 * 60 * 1000;

  it("asks straight away, then waits 3, 7, 14 and then 30 days after each Not now", () => {
    let state = parseReminderState(null);
    expect(reminderDue(state, now)).toBe(true);
    let clock = now;
    for (const days of [3, 7, 14, 30, 30, 30]) {
      state = snoozeReminder(state, clock);
      expect(reminderDue(state, clock + days * day - 1)).toBe(false);
      expect(reminderDue(state, clock + days * day)).toBe(true);
      clock += days * day;
    }
    expect(state.snoozes).toBe(6);
  });

  it("stops for good once the app is on this device", () => {
    expect(reminderDue({ snoozes: 0, added: true }, now)).toBe(false);
    expect(reminderDue(snoozeReminder({ snoozes: 2, added: true }, now), now + 365 * day)).toBe(false);
  });

  it("survives anything a browser might have left in storage", () => {
    for (const raw of ["", "not json", "null", "[]", '{"snoozes":"many","nextAt":"soon"}', '{"snoozes":-4}']) {
      const state = parseReminderState(raw);
      expect(state.snoozes).toBe(0);
      expect(reminderDue(state, now)).toBe(true);
    }
    expect(parseReminderState(JSON.stringify(snoozeReminder({ snoozes: 1 }, now)))).toEqual({ snoozes: 2, nextAt: new Date(now + 7 * day).toISOString() });
    expect(parseReminderState('{"snoozes":3,"added":true}')).toEqual({ snoozes: 3, added: true });
  });
});
