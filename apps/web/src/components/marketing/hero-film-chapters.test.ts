import { describe, expect, it } from "vitest";
import { FILM_CHAPTERS, FILM_DURATION, chapterAt } from "./hero-film-chapters";

describe("hero film chapters", () => {
  it("names the chapter on screen and how far through it the film is", () => {
    expect(chapterAt(0)).toEqual({ index: 0, progress: 0 });
    expect(chapterAt(7.0).index).toBe(0);
    expect(chapterAt(7.1).index).toBe(1);
    expect(chapterAt(7.1).progress).toBeCloseTo(0);
    expect(chapterAt(10).progress).toBeCloseTo((10 - 7.1) / (12.9 - 7.1));
    expect(chapterAt(30).index).toBe(FILM_CHAPTERS.length - 1);
  });

  it("hands the caption back to check-in as the loop crossfades, and wraps past the end", () => {
    expect(chapterAt(35.5).index).toBe(FILM_CHAPTERS.length - 1);
    expect(chapterAt(35.8)).toEqual({ index: 0, progress: 0 });
    expect(chapterAt(FILM_DURATION + 8).index).toBe(1);
    expect(chapterAt(-1).index).toBe(FILM_CHAPTERS.length - 1);
  });
});
