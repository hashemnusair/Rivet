import { Mona_Sans } from "next/font/google";

/**
 * Mona Sans (GitHub with Degarism, the studio behind Palantir's Alliance) sets
 * the RIVET name and its promise on the public night pages: the name at the
 * expanded width, the promise at normal width. Only the components that apply
 * `monaSans.variable` load it, so the product itself never pays for it.
 */
export const monaSans = Mona_Sans({ subsets: ["latin"], axes: ["wdth"], variable: "--font-mona", display: "swap" });
