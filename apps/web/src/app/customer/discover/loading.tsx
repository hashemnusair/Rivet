import { RouteLoadingOverlay } from "@/components/marketing/route-transitions";

/**
 * Cold navigation and refresh land here; in-app clicks get the same loader from
 * `RouteTransitions`. Not fixed-position, so it fills the shell rather than
 * covering the header the visitor just used.
 */
export default function DiscoverLoading() {
  return <RouteLoadingOverlay fixed={false} />;
}
