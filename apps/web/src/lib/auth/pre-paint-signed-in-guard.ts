/**
 * The landing must never be shown to a signed-in account, yet on a first visit
 * to `www` the server may have nothing to go on: Clerk's session cookie is
 * host-scoped and its signed-in marker is not always present there. The
 * definitive signal is the one Clerk's own browser script uses, the Frontend
 * API's client resource, read with the browser's credentials. This inline
 * script runs while the document is still parsing, before anything paints:
 * on the landing it hides the document, asks the Frontend API, and either
 * replaces the location with the resolver or reveals the page. A visible
 * marker cookie short-circuits the request. Any failure or delay reveals the
 * page, so a signed-out visitor is never left blank. A visit that asks for the
 * landing on purpose (`?view=landing`) is left alone.
 *
 * Only a browser that has had a signed-in RIVET account waits for that answer.
 * Every RIVET host writes the account id into the shared language cookie
 * (`rivet_ui_locale_v1`, on `rivetjo.com`) while someone is signed in and
 * clears it when they sign out. Without that id the landing paints at once
 * and the same check runs behind it, still sending a signed-in visitor on;
 * waiting on Clerk delayed every first-time visitor by a round trip.
 */

/** The Clerk Frontend API origin encoded in a publishable key, or null. */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const match = publishableKey?.trim().match(/^pk_(?:live|test)_([A-Za-z0-9+/=_-]+)$/);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1]!, "base64").toString("utf8").replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(decoded) ? `https://${decoded}` : null;
  } catch {
    return null;
  }
}

export const PRE_PAINT_GUARD_TIMEOUT_MS = 2000;

export function prePaintSignedInGuardScript(input: { frontendApi: string; appHosts: readonly string[]; accountCookie: string }): string {
  const clientUrl = JSON.stringify(`${input.frontendApi.replace(/\/$/, "")}/v1/client`);
  const appHosts = JSON.stringify(input.appHosts);
  const accountCookie = new RegExp(`(?:^|; )${input.accountCookie.replace(/[^A-Za-z0-9_]/g, "")}=([^;]*)`).toString();
  return (
    "(function(){var d=document.documentElement;try{" +
    `if(["/","/ar"].indexOf(location.pathname)===-1||${appHosts}.indexOf(location.hostname)!==-1)return;` +
    'if(new URLSearchParams(location.search).get("view")==="landing")return;' +
    'var done=false;function show(){if(!done){done=true;d.style.visibility="";}}' +
    'function go(){done=true;location.replace("/login"+location.search);}' +
    'addEventListener("pageshow",function(e){if(e.persisted){done=false;show();}});' +
    'var m=document.cookie.match(/(?:^|; )__client_uat(?:_[A-Za-z0-9_-]{1,8})?=([^;]*)/);' +
    'if(m&&m[1]&&m[1]!=="0"){d.style.visibility="hidden";go();return;}' +
    `var a=document.cookie.match(${accountCookie}),known=false;` +
    "try{known=!!(a&&JSON.parse(decodeURIComponent(a[1])).owner);}catch(e){}" +
    // No account has been signed in here: paint now, keep asking behind it.
    'if(known){d.style.visibility="hidden";}else{done=true;}' +
    `var t=setTimeout(show,${PRE_PAINT_GUARD_TIMEOUT_MS});` +
    `fetch(${clientUrl},{credentials:"include"}).then(function(r){return r.json();}).then(function(j){` +
    "var s=j&&j.response&&j.response.sessions;clearTimeout(t);" +
    'if(Array.isArray(s)&&s.some(function(x){return x&&x.status==="active";})){go();}else{show();}' +
    "}).catch(function(){clearTimeout(t);show();});" +
    '}catch(e){d.style.visibility="";}})();'
  );
}
