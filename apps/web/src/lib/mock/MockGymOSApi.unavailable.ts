/**
 * Stands in for `MockGymOSApi` in browser bundles that can never select mock
 * data (see `next.config.mjs`). A production build only reads seeded preview
 * data when it was built with `NEXT_PUBLIC_DATA_MODE=mock`; every other build
 * resolves to Convex, so it ships this instead of the seeded database and its
 * engine (about 700 KB of script on every screen).
 *
 * Constructing it fails closed, as `dataMode()` does for a production runtime.
 */
export class MockGymOSApi {
  constructor() {
    throw new Error("RIVET production runtime cannot use mock data mode.");
  }
}
