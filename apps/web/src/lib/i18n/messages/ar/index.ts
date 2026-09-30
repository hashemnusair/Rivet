import type { Messages } from "../en";
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
 * Typed against the English catalogue, so a missing or extra key is a build
 * error. All wording follows docs/arabic/GLOSSARY.md: one Arabic term per concept.
 */
export const ar: Messages = {
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
