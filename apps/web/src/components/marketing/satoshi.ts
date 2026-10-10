import localFont from "next/font/local";

/** The approved English landing face; the unmodified Fontshare license is adjacent. */
export const satoshi = localFont({
  src: "./fonts/Satoshi-Variable.woff2",
  weight: "300 900",
  variable: "--font-satoshi",
  display: "swap",
});
