import { auth } from "./auth";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { domain } from "./domain";
import { memberProfile } from "./memberProfile";
import { members } from "./members";
import { nav } from "./nav";
import { palette } from "./palette";
import { renewFlow } from "./renewFlow";
import { shell } from "./shell";

/**
 * English is the source of truth: `Messages` is derived from it, so the Arabic
 * catalogue fails to compile the moment a key is added here and not there.
 * Areas are separate modules so each stays reviewable and so a later agent can
 * translate one area without touching another. Keys are stable identifiers:
 * rewording English never renames a key.
 */
export const en = {
  auth,
  common,
  dashboard,
  domain,
  memberProfile,
  members,
  nav,
  palette,
  renewFlow,
  shell,
};

export type Messages = typeof en;
