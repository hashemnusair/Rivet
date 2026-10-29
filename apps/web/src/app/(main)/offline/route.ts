import { offlineDocument } from "@/lib/public/offline-document";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";
import { ARABIC_ENABLED } from "@/lib/i18n/config";

/** Public shell only. A route avoids serializing authenticated root-layout state into the offline cache. */
export function GET(request: Request): Response {
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${LOCALE_COOKIE}=`));
  const locale = ARABIC_ENABLED && cookie?.slice(LOCALE_COOKIE.length + 1) === "ar" ? "ar" : "en";
  return new Response(offlineDocument(locale), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
