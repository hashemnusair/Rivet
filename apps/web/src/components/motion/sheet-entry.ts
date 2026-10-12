import { RIVET_HOSTS } from "@/lib/routing/host-routing";
import { drawingSvg } from "@/app/login/sign-in-drawings";
import { ART_VIEWBOX, OPENING_DRAWING, SHEET_ENTRY_ID } from "./sheet-store";

/** An SVG as a CSS `url()`: only what a data URI cannot carry is escaped. */
export const svgUrl = (svg: string) => `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/[%#<>]/g, encodeURIComponent)}")`;

/**
 * The sheet as it stands when a page on another host is left: its night, its
 * grid and its drawing, fully drawn, in the drawing's own box
 * (`page-sheet.module.css`). The drawing is the opening one (the landing's and
 * sign-in's); a door page names its own with `SheetEntryArt`. The page's own
 * drawing stays hidden while the cover is up, because the cover lands its
 * copy on it.
 */
const COVER_CSS =
  "html::after{content:'';position:fixed;inset:0;z-index:300;pointer-events:none;background:#0b0a08;" +
  "background-image:linear-gradient(rgba(242,240,230,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(242,240,230,.035) 1px,transparent 1px);background-size:40px 40px}" +
  `html::before{content:'';position:fixed;top:0;bottom:0;left:0;width:100%;z-index:301;pointer-events:none;background:${svgUrl(drawingSvg(OPENING_DRAWING))} center/contain no-repeat}` +
  "@media(min-width:1024px){html::before{left:25%;width:50%}}" +
  "[data-sheet-dock]>svg{visibility:hidden}" +
  "@media(prefers-reduced-motion:reduce){html::before,html::after{display:none}}";

/** A sign-in page's words (`data-sheet-words`) wait under the cover, as they do under a sheet. */
const WORDS_CSS = "html [data-sheet-words]{animation-play-state:paused}";

/** The sheet's own fade (`sheet-out`, LIFT_MS): of the whole cover, or of its night alone. */
const fade = (layers: string) => `${layers}{animation:rivet-sheet-entry .46s cubic-bezier(.4,0,.2,1) forwards}@keyframes rivet-sheet-entry{to{opacity:0}}`;
const LIFT_CSS = fade("html::before,html::after");
const NIGHT_LIFT_CSS = fade("html::after");

/**
 * Covers a full-document arrival before paint, including one from another
 * RIVET host or an external site, with the sheet the page before was left
 * on, so the drawing seen there stays on screen while this page loads. Once
 * the page has painted, the cover lifts by itself: nothing waits for the
 * page's scripts. On a sign-in page whose art panel is on screen, the drawing
 * glides onto the panel as the night fades, as a sheet's does (`DOCK_MS`,
 * with the page's words following at `WORDS_MS`); the cover goes once the
 * page has taken its own drawing over, drawn (`sheetCarries`), so the lines
 * never draw again. The panel shows from 1024px, where the cover's drawing
 * sits in the middle half. No cookie, URL marker or storage is needed;
 * without JavaScript (or with reduced motion) the page is visible
 * immediately, and a page the browser prepares ahead of the click lifts when
 * it is shown. App-host roots are workspaces, not the public landing.
 */
export const SHEET_ENTRY_PRE_PAINT = String.raw`(()=>{if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;var p=location.pathname;if(p!=="/"&&!/^\/login(?:\/(?:gym|member(?:\/create)?|admin))?$/.test(p))return;if(p==="/"&&${JSON.stringify([RIVET_HOSTS.gym, RIVET_HOSTS.member, RIVET_HOSTS.platform, "admin.rivetjo.com"])}.includes(location.hostname))return;var add=(css,id)=>{var e=document.createElement("style");if(id)e.id=id;e.textContent=css;document.head.appendChild(e);return e};var s=add(${JSON.stringify(COVER_CSS)},${JSON.stringify(SHEET_ENTRY_ID)});var w=add(${JSON.stringify(WORDS_CSS)});var lifted=false;var lift=()=>{if(lifted)return;lifted=true;var d=document.querySelector("[data-sheet-dock]"),t=d&&d.getBoundingClientRect();if(!t||!t.width){s.textContent+=${JSON.stringify(LIFT_CSS)};w.remove();setTimeout(()=>s.remove(),600);return}var h=document.documentElement,W=h.clientWidth,H=h.clientHeight,fit=(x,y)=>Math.min(x/${ART_VIEWBOX.width},y/${ART_VIEWBOX.height}),limit=performance.now()+3000;s.textContent+=${JSON.stringify(NIGHT_LIFT_CSS)}+"html::before{animation:rivet-sheet-dock .76s cubic-bezier(.65,0,.35,1) forwards}@keyframes rivet-sheet-dock{to{transform:translate("+(t.left+t.width/2-W/2)+"px,"+(t.top+t.height/2-H/2)+"px) scale("+fit(t.width,t.height)/fit(W/2,H)+")}}";setTimeout(()=>w.remove(),380);var land=()=>{if(document.querySelector("[data-sheet-dock]>svg[data-art-pending]")&&performance.now()<limit)setTimeout(land,50);else s.remove()};setTimeout(land,800)};var painted=()=>requestAnimationFrame(()=>requestAnimationFrame(lift));var ready=()=>{if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",painted,{once:true});else painted();setTimeout(lift,4000)};if(document.prerendering)document.addEventListener("prerenderingchange",ready,{once:true});else ready()})()`;
