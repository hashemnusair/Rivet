import { navigationCatalogue } from "./navigationCatalogue";
import { crmCompletion } from "./crmCompletion";
import { platformFinance } from "./platformFinance";
import { platformConsole } from "./platformConsole";
import { publicCompletion } from "./publicCompletion";
import { staffTools } from "./staffTools";
import { deskCompletion } from "./deskCompletion";
import { communicationCompletion } from "./communicationCompletion";
import { reportsWorkspace } from "./reportsWorkspace";
import { statements } from "./statements";
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
  navigationCatalogue,
  crmCompletion,
  platformFinance,
  platformConsole,
  publicCompletion,
  staffTools,
  deskCompletion,
  communicationCompletion,

  reportsWorkspace,
  statements,
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

export type Messages = typeof en;
