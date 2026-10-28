/**
 * Pure helpers that make a streaming answer read smoothly.
 *
 * - `splitBlocks` cuts markdown into top-level blocks so finished paragraphs
 *   never re-render while the last one grows.
 * - `healMarkdown` closes syntax the model has opened but not yet closed, so
 *   half-written bold, code or links never flash as raw characters and a
 *   table appears as a table from its first row.
 * - `revealStep` paces the visible text: steady when the stream is steady,
 *   catching up quickly after a burst, always ending on a whole word so
 *   Arabic letters never change shape as they appear.
 */

const FENCE = /^\s{0,3}(```|~~~)/;

/** Top-level blocks: separated by blank lines outside fenced code. */
export function splitBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | undefined;
  for (const line of markdown.split("\n")) {
    const opener = FENCE.exec(line)?.[1];
    if (opener) {
      if (!fence) fence = opener;
      else if (opener === fence) fence = undefined;
    }
    if (!fence && line.trim() === "" && !opener) {
      if (current.length) blocks.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks;
}

function countOutsideCode(text: string, marker: string): number {
  let count = 0;
  let inCode = false;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "`") {
      inCode = !inCode;
      continue;
    }
    if (!inCode && text.startsWith(marker, index)) {
      count += 1;
      index += marker.length - 1;
    }
  }
  return count;
}

function tableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.length > 1;
}

/** Closes what the last, still-growing block left open. Earlier blocks are complete and untouched. */
export function healMarkdown(block: string): string {
  let text = block;
  // An unclosed fence: close it so the code renders as code while it streams.
  const fences = text.split("\n").filter((line) => FENCE.test(line)).length;
  if (fences % 2 === 1) return `${text}\n\`\`\``;

  // A table whose header has arrived but not its separator row.
  const lines = text.split("\n");
  if (lines.length && tableRow(lines[0]!) && !lines.some((line) => /^\s*\|?\s*:?-{3,}/.test(line))) {
    const columns = Math.max(1, lines[0]!.trim().replace(/^\||\|$/g, "").split("|").length);
    const header = lines[0]!.trim().endsWith("|") ? lines[0]! : `${lines[0]!} |`;
    return [header, `|${" --- |".repeat(columns)}`, ...lines.slice(1)].join("\n");
  }
  // A table row being written: hold back the partial cell so the grid never reflows mid-cell.
  if (lines.length > 2 && tableRow(lines[0]!) && !lines.at(-1)!.trim().endsWith("|")) {
    text = lines.slice(0, -1).join("\n");
  }

  // A link whose target has not arrived: show its text only.
  text = text.replace(/\[([^\]\n]*)\]\([^)\n]*$/, "$1").replace(/\[([^\]\n]*)$/, "$1");

  const ticks = (text.match(/`/g) ?? []).length;
  if (ticks % 2 === 1) text = text.endsWith("`") ? text.slice(0, -1) : `${text}\``;
  for (const marker of ["**", "~~"]) {
    if (countOutsideCode(text, marker) % 2 === 1) text = text.replace(/\s+$/, "") + marker;
  }
  // Markers opened and closed with nothing between them render as literal characters; drop them.
  return text.replace(/\s*(\*\*|~~|`)\s*\1$/, "");
}

/** Index just past the next word boundary at or after `from`. */
function wordEnd(target: string, from: number): number {
  if (from >= target.length) return target.length;
  let index = from;
  while (index < target.length && /\s/.test(target[index]!)) index++;
  while (index < target.length && !/\s/.test(target[index]!)) index++;
  return index;
}

/**
 * How far the visible text should advance this frame. `elapsedMs` is the
 * frame time; the reveal speed grows with the backlog so a burst drains in
 * about a third of a second and a trickle reads at the model's own pace.
 */
export function revealStep(target: string, shown: number, elapsedMs: number, streaming: boolean): number {
  if (shown >= target.length) return target.length;
  const backlog = target.length - shown;
  const perSecond = streaming ? Math.max(90, backlog * 3) : Math.max(600, backlog * 8);
  const budget = Math.max(1, Math.round((perSecond * Math.min(elapsedMs, 64)) / 1000));
  const next = wordEnd(target, shown + budget - 1);
  // While the stream is live, never reveal a word that may still be growing.
  if (streaming && next >= target.length && !/\s$/.test(target)) {
    const lastSpace = target.search(/\s\S*$/);
    return lastSpace > shown ? lastSpace : shown;
  }
  return next;
}
