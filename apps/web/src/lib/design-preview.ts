export type DesignPreviewEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  RIVET_DESIGN_PREVIEW?: string;
  NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS?: string;
};

/**
 * The component gallery is a development artifact, never a product route.
 * Vercel Production wins over every other value so a misplaced flag fails
 * closed instead of exposing the gallery. Outside Vercel, a bundle built as
 * an approved mock preview (the browser-test bundle) may opt in with the
 * same explicit flag; an unclassified production build never can.
 */
export function designPreviewEnabled(env: DesignPreviewEnvironment): boolean {
  if (env.VERCEL_ENV === "production" || env.NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS === "production") return false;
  if (env.NODE_ENV === "development" && !env.VERCEL_ENV) return true;
  if (env.RIVET_DESIGN_PREVIEW !== "1") return false;
  return env.VERCEL_ENV === "preview" || (!env.VERCEL_ENV && env.NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS === "preview");
}
