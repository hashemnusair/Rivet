import { accountingMessages } from "./accountingMessages";
import { ledgerWorkspace } from "./ledgerWorkspace";
import { payablesWorkspace } from "./payablesWorkspace";
import { stockWorkspace } from "./stockWorkspace";
import { operationsWorkspace } from "./operationsWorkspace";
import { ptWorkspace } from "./ptWorkspace";
import { classWorkspace } from "./classWorkspace";
import { memberMigration } from "./memberMigration";
import { memberEnrollment } from "./memberEnrollment";
import { salesWorkspace } from "./salesWorkspace";
import { settingsPublic } from "./settingsPublic";
import { settingsDetails } from "./settingsDetails";
import { settingsCore } from "./settingsCore";
import { publicDocuments } from "./publicDocuments";
import { publicPrivacy } from "./publicPrivacy";
import { publicTerms } from "./publicTerms";
import { setup } from "./setup";
import { permissions } from "./permissions";
import { customerPortal } from "./customerPortal";
import { authErrors } from "./authErrors";
import { memberExperience } from "./memberExperience";
import { errorValues } from "./errorValues";
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
  accountingMessages,
  ledgerWorkspace,
  payablesWorkspace,
  stockWorkspace,
  operationsWorkspace,
  ptWorkspace,
  classWorkspace,
  memberMigration,
  memberEnrollment,
  salesWorkspace,
  settingsPublic,
  settingsDetails,
  settingsCore,
  publicDocuments,
  publicPrivacy,
  publicTerms,
  setup,
  permissions,
  customerPortal,
  authErrors,
  memberExperience,
  errorValues,
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
