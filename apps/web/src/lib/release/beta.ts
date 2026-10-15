/**
 * RIVET is in its beta launch. While this is true the lockup carries a "Beta"
 * mark, the public site, sign-in and the gym workspace show a short beta
 * notice, and every email carries the mark and goes out as "RIVET Beta". Set
 * it to false at general release and every one of them goes.
 */
export const RIVET_IN_BETA = true;

/**
 * The sender for every RIVET email, keeping the configured address and
 * replacing its display name: "RIVET Beta" during the beta, "RIVET" after.
 * Accepts either `name <address>` or a bare address, as Resend does.
 */
export function rivetSender(configured: string): string {
  const value = configured.trim();
  const address = value.match(/<([^<>]+)>\s*$/)?.[1]?.trim() ?? value;
  return `${RIVET_IN_BETA ? "RIVET Beta" : "RIVET"} <${address}>`;
}
