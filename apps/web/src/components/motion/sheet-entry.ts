import { RIVET_HOSTS } from "@/lib/routing/host-routing";
import { drawingSvg } from "@/app/login/sign-in-drawings";
import { OPENING_DRAWING } from "./sheet-store";

export const SHEET_ENTRY_ID = "rivet-sheet-entry";

/** An SVG as a CSS `url()`: only what a data URI cannot carry is escaped. */
export const svgUrl = (svg: string) => `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/[%#<>]/g, encodeURIComponent)}")`;

/**
 * The sheet as it stands when a page on another host is left: its night, its
 * grid and its drawing, fully drawn, in the drawing's own box
 * (`page-sheet.module.css`). The drawing is the opening one (the landing's and
 * sign-in's); a door page names its own with `SheetEntryArt`.
 */
const COVER_CSS =
  "html::after{content:'';position:fixed;inset:0;z-index:300;pointer-events:none;background:#0b0a08;" +
  "background-image:linear-gradient(rgba(242,240,230,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(242,240,230,.035) 1px,transparent 1px);background-size:40px 40px}" +
  `html::before{content:'';position:fixed;top:0;bottom:0;left:0;width:100%;z-index:301;pointer-events:none;background:${svgUrl(drawingSvg(OPENING_DRAWING))} center/contain no-repeat}` +
  "@media(min-width:1024px){html::before{left:25%;width:50%}}" +
  "@media(prefers-reduced-motion:reduce){html::before,html::after{display:none}}";

/** The sheet's own lift (`sheet-out`, LIFT_MS). */
const LIFT_CSS = "html::before,html::after{animation:rivet-sheet-entry .46s cubic-bezier(.4,0,.2,1) forwards}@keyframes rivet-sheet-entry{to{opacity:0}}";

/**
 * Covers a full-document arrival before paint, including one from another
 * RIVET host or an external site, with the sheet the page before was left
 * on, so the drawing seen there stays on screen while this page loads. Once
 * the page has painted, the cover lifts by itself: nothing waits for the
 * page's scripts. No cookie, URL marker or storage is needed; without
 * JavaScript (or with reduced motion) the page is visible immediately, and a
 * page the browser prepares ahead of the click lifts when it is shown.
 * App-host roots are workspaces, not the public landing.
 */
export const SHEET_ENTRY_PRE_PAINT = String.raw`(()=>{if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;var p=location.pathname;if(p!=="/"&&!/^\/login(?:\/(?:gym|member(?:\/create)?|admin))?$/.test(p))return;if(p==="/"&&${JSON.stringify([RIVET_HOSTS.gym, RIVET_HOSTS.member, RIVET_HOSTS.platform, "admin.rivetjo.com"])}.includes(location.hostname))return;var s=document.createElement("style");s.id=${JSON.stringify(SHEET_ENTRY_ID)};s.textContent=${JSON.stringify(COVER_CSS)};document.head.appendChild(s);var lifted=false;var lift=()=>{if(lifted)return;lifted=true;s.textContent+=${JSON.stringify(LIFT_CSS)};setTimeout(()=>s.remove(),600)};var painted=()=>requestAnimationFrame(()=>requestAnimationFrame(lift));var ready=()=>{if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",painted,{once:true});else painted();setTimeout(lift,4000)};if(document.prerendering)document.addEventListener("prerenderingchange",ready,{once:true});else ready()})()`;
