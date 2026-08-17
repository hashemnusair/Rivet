import type { Messages } from "../en";
import { common } from "./common";
import { domain } from "./domain";
import { marketing } from "./marketing";
import { nav } from "./nav";

/** Typed against the English catalogue — a missing key is a build error. */
export const ar: Messages = {
  common,
  domain,
  marketing,
  nav,
};
