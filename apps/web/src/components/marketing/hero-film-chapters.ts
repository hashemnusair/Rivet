/**
 * Where each feature starts in the hero film, in seconds. The scene table is
 * in scripts/hero-film/film.js; a chapter begins halfway through the crossfade
 * into its scene, so the caption changes as the picture does.
 */
export const FILM_DURATION = 36;

export const FILM_CHAPTERS = [
  { key: "checkIn", start: 0 },
  { key: "classes", start: 7.1 },
  { key: "payments", start: 12.9 },
  { key: "sales", start: 18.7 },
  { key: "member", start: 24.3 },
  { key: "owner", start: 29.9 },
] as const;

export type FilmChapterKey = (typeof FILM_CHAPTERS)[number]["key"];

/** The check-in scene fades back in over the loop point, so its caption returns early. */
const LOOP_HANDOFF = 35.75;

/** The chapter playing at `time` and how far through it the film is (0–1). */
export function chapterAt(time: number): { index: number; progress: number } {
  const t = ((time % FILM_DURATION) + FILM_DURATION) % FILM_DURATION;
  if (t >= LOOP_HANDOFF) return { index: 0, progress: 0 };
  const index = FILM_CHAPTERS.reduce((found, chapter, i) => (t >= chapter.start ? i : found), 0);
  const start = FILM_CHAPTERS[index]?.start ?? 0;
  const end = FILM_CHAPTERS[index + 1]?.start ?? LOOP_HANDOFF;
  return { index, progress: Math.min(1, Math.max(0, (t - start) / (end - start))) };
}
