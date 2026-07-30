import type { GymOSApi } from "./GymOSApi";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";

/**
 * Client factory. Today it always returns the in-memory mock. The backend
 * agent adds `HttpGymOSApi` and switches on an env flag here — no page or
 * component changes required.
 */
let instance: GymOSApi | null = null;

export function getApi(): GymOSApi {
  if (typeof window === "undefined") {
    // Server components never hold state; give them a throwaway instance so
    // types work. All interactive data flows through the browser singleton.
    return new MockGymOSApi();
  }
  if (!instance) {
    instance = new MockGymOSApi();
  }
  return instance;
}

/** Test hook — replace the active client (e.g. with a fresh seeded mock). */
export function setApiForTests(api: GymOSApi | null) {
  instance = api;
}
