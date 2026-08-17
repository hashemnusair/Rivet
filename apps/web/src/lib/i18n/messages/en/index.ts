import { common } from "./common";
import { dashboard } from "./dashboard";
import { domain } from "./domain";
import { marketing } from "./marketing";
import { members } from "./members";
import { nav } from "./nav";
import { reception } from "./reception";

/**
 * English is the source of truth: `Messages` is derived from it, so the Arabic
 * catalogue fails to compile the moment a key is added here and not there.
 * Areas are separate modules purely so each stays reviewable.
 */
export const en = {
  common,
  dashboard,
  domain,
  marketing,
  members,
  nav,
  reception,
};

export type Messages = typeof en;
