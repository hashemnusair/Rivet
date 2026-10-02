/**
 * Mixed-direction text helpers.
 *
 * Names, phone numbers, emails, receipt and member numbers, and amounts keep
 * their own direction inside an Arabic sentence. In JSX prefer `<bdi>` (or
 * `dir="auto"` on a wrapper). For values that must be glued into a translated
 * string, wrap them with `isolate`, which uses Unicode isolates so the
 * surrounding sentence cannot reorder them.
 */
const LRI = "⁦";
const FSI = "⁨";
const PDI = "⁩";

/** Keep a left-to-right value (phone, id, amount, number range) intact inside any sentence. */
export function isolateLtr(value: string | number): string {
  return `${LRI}${value}${PDI}`;
}

/** Isolate user text of unknown direction (a person's name) inside a sentence. */
export function isolate(value: string | number): string {
  return `${FSI}${value}${PDI}`;
}
