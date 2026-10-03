import { createTranslator } from "../i18n/core";
import { dirFor, type Locale } from "../i18n/locale";

export function offlineDocument(locale: Locale): string {
  const content = (["en", "ar"] as const).map((language) => {
    const t = createTranslator(language);
    return `<section data-offline-locale="${language}" lang="${language}" dir="${dirFor(language)}"><p>${t("setup.offline")}</p><h1>${t("setup.reconnect")}</h1><p>${t("setup.offlineDescription")}</p><a href="/customer/my-gyms">${t("common.action.retry")}</a></section>`;
  }).join("");
  return `<!doctype html><html lang="${locale}" dir="${dirFor(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>RIVET</title><style>body{margin:0;background:#f5f4ef;color:#15140f;font:15px/1.65 system-ui,sans-serif}main{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;padding:24px 20px max(40px,env(safe-area-inset-bottom));text-align:center}section{max-width:360px}h1{font-size:26px;line-height:1.2;letter-spacing:-.03em}p{color:#625f55}a{display:inline-block;padding:10px 22px;margin-top:12px;background:#15140f;color:white;border-radius:6px;text-decoration:none;font-weight:600}a:focus-visible{outline:3px solid #ad6d00;outline-offset:4px}[data-offline-locale]{display:none}html[lang="en"] [data-offline-locale="en"],html[lang="ar"] [data-offline-locale="ar"]{display:block}</style></head><body><main><img src="/brand/rivet-glyph.png" alt="" width="41" height="64">${content}</main></body></html>`;
}
