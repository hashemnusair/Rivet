import { getRequestLocale } from "@/lib/i18n/server";
import { memberManifest } from "@/lib/pwa/member-manifest";

/**
 * Served at the old `app/manifest.ts` address so installed apps keep checking
 * the same URL for updates, but linked only from member pages (see
 * `MEMBER_MANIFEST_PATH`). The file convention linked it from every page,
 * which offered gym staff "RIVET Member" on the dashboard.
 */
export async function GET(request: Request) {
  const manifest = memberManifest(await getRequestLocale(), new URL(request.url).origin);
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
