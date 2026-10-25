import { normalizeNoteText } from "./relative-dates";

/**
 * Machine-problem intake assistance (AI-4.3), deterministic and bilingual.
 * It suggests which registered machine a staff description is about and a
 * short title. It never suggests severity or whether the machine is safe:
 * a person who saw the machine decides that in the existing form.
 */

export interface MachineLike {
  id: string;
  code: string;
  name: string;
}

export interface MachineMatch {
  id: string;
  /** Why it matched: the machine's code, words of its name, or its kind in either language. */
  reason: "code" | "name" | "kind";
  /** Words in the description that produced the match, verbatim after normalisation. */
  evidence: string;
}

/** Machine kinds as staff write them in English and Jordanian Arabic. */
const KINDS: Array<{ en: RegExp; ar: RegExp }> = [
  { en: /\btreadmills?\b/, ar: /(مشاي[ةه]|المشاي[ةه]|تريدميل|جهاز المشي)/u },
  { en: /\b(bikes?|cycles?|spin)\b/, ar: /(دراج[ةه]|الدراج[ةه]|بسكليت|سبين)/u },
  { en: /\b(rowers?|rowing)\b/, ar: /(تجديف|التجديف)/u },
  { en: /\b(ellipticals?|cross ?trainers?)\b/, ar: /(اوربت|أوربت|إليبتيكال|اليبتيكال)/u },
  { en: /\b(cable|pulley)\b/, ar: /(كيبل|الكيبل|بكرة)/u },
  { en: /\bbench(es)?\b/, ar: /(بنش|البنش|مقعد)/u },
  { en: /\b(squat|smith|rack)\b/, ar: /(سكوات|سميث|الرف)/u },
  { en: /\b(leg press)\b/, ar: /(ليج برس|ضغط الرجل)/u },
  { en: /\bdumbbells?\b/, ar: /(دمبل|الدمبل|دمبلز)/u },
];

function words(value: string): string[] {
  // Numbers count at any length ("Treadmill 3"); single letters are noise.
  return normalizeNoteText(value).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 2 || /^\d+$/.test(word));
}

/** Ranked suggestions: a written machine code wins, then name words, then the machine's kind; a matching number raises a match. */
export function suggestMachines(description: string, machines: readonly MachineLike[]): MachineMatch[] {
  return scoredMatches(description, machines).map(({ score: _score, ...match }) => match);
}

function scoredMatches(description: string, machines: readonly MachineLike[]): Array<MachineMatch & { score: number }> {
  const text = normalizeNoteText(description).toLowerCase();
  const textWords = new Set(words(text));
  const numbers = new Set(text.match(/\d+/g) ?? []);
  const scored: Array<MachineMatch & { score: number }> = [];
  for (const machine of machines) {
    const code = normalizeNoteText(machine.code).toLowerCase();
    if (code && new RegExp(`(^|[^\\p{L}\\p{N}])${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(text)) {
      scored.push({ id: machine.id, reason: "code", evidence: machine.code, score: 100 });
      continue;
    }
    const all = words(machine.name);
    const nameWords = all.filter((word) => !/^\d+$/.test(word));
    const nameNumbers = all.filter((word) => /^\d+$/.test(word));
    // A different number rules a machine out ("treadmill 4" is not Treadmill 3); no number in the text leaves it open.
    if (nameNumbers.length && numbers.size && !nameNumbers.some((number) => numbers.has(number))) continue;
    const numberBonus = nameNumbers.length && nameNumbers.some((number) => numbers.has(number)) ? 15 : 0;
    const shared = nameWords.filter((word) => textWords.has(word));
    if (shared.length) {
      scored.push({ id: machine.id, reason: "name", evidence: shared.join(" "), score: 40 + shared.length * 10 + numberBonus });
      continue;
    }
    const kind = KINDS.find((item) => item.en.test(normalizeNoteText(machine.name).toLowerCase()));
    const said = kind ? text.match(kind.en) ?? text.match(kind.ar) : null;
    if (kind && said) scored.push({ id: machine.id, reason: "kind", evidence: said[0], score: 20 + numberBonus });
  }
  return scored.sort((left, right) => right.score - left.score);
}

/**
 * The machine to preselect, only when the description points to exactly one:
 * a code, or a single best match. "The treadmill" with three treadmills picks
 * none and lists them for the person to choose.
 */
export function preselectedMachine(description: string, machines: readonly MachineLike[]): MachineMatch | undefined {
  const [first, second] = scoredMatches(description, machines);
  if (!first) return undefined;
  if (first.reason === "code" || !second || first.score > second.score) {
    const { score: _score, ...match } = first;
    return match;
  }
  return undefined;
}

/** A short title from the first sentence of the description; the person can change it. */
export function suggestedTitle(description: string): string {
  const first = normalizeNoteText(description).split(/[.!?؟\n]/u)[0]!.trim();
  return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first;
}
