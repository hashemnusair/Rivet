import { RIVET_HOSTS } from "@/lib/routing/host-routing";

export const SHEET_ENTRY_ID = "rivet-sheet-entry";

/**
 * Cover full-document arrivals before paint, including returning from another
 * RIVET host or an external site, in the sheet's own night and grid, so a
 * sheet left on the page before runs on unbroken. PageSheet takes over at
 * hydration. No cookie, URL marker or storage is needed. A failed bundle
 * releases the cover after 12s; without JavaScript (or with reduced motion)
 * the page is visible immediately. App-host roots are workspaces, not the
 * public landing.
 */
export const SHEET_ENTRY_PRE_PAINT = String.raw`(()=>{if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;var p=location.pathname;if(p!=="/"&&!/^\/login(?:\/(?:gym|member(?:\/create)?|admin))?$/.test(p))return;if(p==="/"&&${JSON.stringify([RIVET_HOSTS.gym, RIVET_HOSTS.member, RIVET_HOSTS.platform, "admin.rivetjo.com"])}.includes(location.hostname))return;var s=document.createElement("style");s.id=${JSON.stringify(SHEET_ENTRY_ID)};s.textContent="html::after{content:'';position:fixed;inset:0;z-index:300;background:#0b0a08;background-image:linear-gradient(rgba(242,240,230,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(242,240,230,.035) 1px,transparent 1px);background-size:40px 40px;pointer-events:none}@media(prefers-reduced-motion:reduce){html::after{display:none}}";document.head.appendChild(s);var release=()=>setTimeout(()=>s.remove(),12000);if(document.prerendering)document.addEventListener("prerenderingchange",release,{once:true});else release()})()`;
