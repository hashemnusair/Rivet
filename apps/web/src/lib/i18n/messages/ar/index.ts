import type { Messages } from "../en";
import { common } from "./common";
import { crm } from "./crm";
import { dashboard } from "./dashboard";
import { domain } from "./domain";
import { marketing } from "./marketing";
import { members } from "./members";
import { nav } from "./nav";
import { reception } from "./reception";

/** Typed against the English catalogue — a missing key is a build error. */
export const ar: Messages = {
  common,
  crm,
  dashboard,
  domain,
  marketing,
  members,
  nav,
  reception,
};
