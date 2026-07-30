import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext / Cloudflare build config.
 *
 * Defaults are all this app needs: every page is a client component reading
 * from an in-browser mock, so there is no server data cache, no ISR and no
 * incremental cache to wire up. When the backend agent adds `HttpGymOSApi`
 * and real server-side data, revisit `incrementalCache` and `tagCache` here.
 */
export default defineCloudflareConfig();
