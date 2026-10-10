/**
 * Runs before the first paint (root layout). A sign-in page reached from
 * another sign-in page carries `?art=`; its drawing arrives as the page
 * before's lines, so the server's copy (`data-art-pending`) stays hidden until
 * the page takes over. Without it the visitor would see this page's drawing,
 * then the old one, then the move. A page the browser prepares ahead of the
 * click is marked `data-prerendering` until it is shown, so its entrance
 * waits for the visitor.
 */
export const SIGN_IN_ART_PRE_PAINT = `if(/[?&]art=/.test(location.search)){var s=document.createElement("style");s.textContent="[data-art-pending]{visibility:hidden}";document.head.appendChild(s)}if(document.prerendering){var h=document.documentElement;h.setAttribute("data-prerendering","");document.addEventListener("prerenderingchange",function(){h.removeAttribute("data-prerendering")},{once:true})}`;
