export type DesignPreviewEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  RIVET_DESIGN_PREVIEW?: string;
};

/**
 * The component gallery is a development artifact, never a product route.
 * Vercel Production wins over every other value so a misplaced flag fails
 * closed instead of exposing the gallery.
 */
export function designPreviewEnabled(env: DesignPreviewEnvironment): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.NODE_ENV === "development" && !env.VERCEL_ENV) return true;
  return env.VERCEL_ENV === "preview" && env.RIVET_DESIGN_PREVIEW === "1";
}
