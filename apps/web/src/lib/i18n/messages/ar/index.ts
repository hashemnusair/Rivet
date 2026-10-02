import { apiErrors } from "./apiErrors";
import { agreementFlow } from "./agreementFlow";
import { agreementDocument } from "./agreementDocument";
import { documents } from "./documents";
import { reception } from "./reception";
import { marketing } from "./marketing";
import { crm } from "./crm";
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

/** Approved terminology: docs/arabic/STANDARD.md and DECISIONS.md. */
export const ar: Messages = {
  apiErrors,
  agreementFlow,
  agreementDocument,
  documents,
  auth,
  common,
  reception,
  marketing,
  crm,
  dashboard,
  domain,
  memberProfile,
  members,
  nav,
  palette,
  renewFlow,
  shell,
};
