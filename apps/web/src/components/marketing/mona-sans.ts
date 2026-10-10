import { Mona_Sans } from "next/font/google";

/**
 * Mona Sans (GitHub with Degarism, the studio behind Palantir's Alliance) sets
 * the RIVET name and its promise on the public night pages. Only the components
 * that apply a loader's `variable` download it, so the product never pays for it.
 */

/** With the width axis (98 KB): the landing's expanded "RIVET". */
export const monaSans = Mona_Sans({ subsets: ["latin"], axes: ["wdth"], variable: "--font-mona", display: "swap" });

/** Weight only (40 KB): sign-in headings and captions, which never widen. */
export const monaSansText = Mona_Sans({ subsets: ["latin"], variable: "--font-mona", display: "swap" });
