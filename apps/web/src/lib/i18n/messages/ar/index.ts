import type { Messages } from "../en";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { domain } from "./domain";
import { marketing } from "./marketing";
import { nav } from "./nav";
import { reception } from "./reception";

/** Typed against the English catalogue — a missing key is a build error. */
export const ar: Messages = {
  common,
  dashboard,
  domain,
  marketing,
  nav,
  reception,
};
