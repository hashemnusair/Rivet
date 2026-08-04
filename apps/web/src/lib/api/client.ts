import type { GymOSApi } from "./GymOSApi";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { ConvexGymOSApi, dataMode } from "./ConvexGymOSApi";

/**
 * Client factory. Mock mode is explicit for preview/tests; deployed builds
 * default to Convex and fail closed when its configuration is missing.
 */
let instance: GymOSApi | null = null;

export function getApi(): GymOSApi {
  if (typeof window === "undefined") {
    // Server components never hold state. Production still gets a fail-closed
    // Convex adapter here; it must never silently instantiate preview data.
    return dataMode() === "convex" ? new ConvexGymOSApi() : new MockGymOSApi();
  }
  if (!instance) {
    instance = dataMode() === "convex" ? new ConvexGymOSApi() : new MockGymOSApi();
  }
  return instance;
}

/** Test hook — replace the active client (e.g. with a fresh seeded mock). */
export function setApiForTests(api: GymOSApi | null) {
  instance = api;
}
