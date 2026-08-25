/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessMaintenance from "../accessMaintenance.js";
import type * as accounting from "../accounting.js";
import type * as accountingLedger from "../accountingLedger.js";
import type * as automations from "../automations.js";
import type * as brand from "../brand.js";
import type * as crons from "../crons.js";
import type * as customer from "../customer.js";
import type * as domain from "../domain.js";
import type * as gymApplications from "../gymApplications.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as invariants from "../invariants.js";
import type * as invitations from "../invitations.js";
import type * as managementReports from "../managementReports.js";
import type * as marketing from "../marketing.js";
import type * as media from "../media.js";
import type * as mediaSanitizer from "../mediaSanitizer.js";
import type * as membershipJobs from "../membershipJobs.js";
import type * as notificationDelivery from "../notificationDelivery.js";
import type * as operationalEmail from "../operationalEmail.js";
import type * as operations from "../operations.js";
import type * as permissions from "../permissions.js";
import type * as platformGymDetail from "../platformGymDetail.js";
import type * as platformOverview from "../platformOverview.js";
import type * as platformPlanCatalog from "../platformPlanCatalog.js";
import type * as platformProvisioning from "../platformProvisioning.js";
import type * as platformProvisioningAction from "../platformProvisioningAction.js";
import type * as ptJobs from "../ptJobs.js";
import type * as publicAbuse from "../publicAbuse.js";
import type * as reconciliation from "../reconciliation.js";
import type * as renewalJobs from "../renewalJobs.js";
import type * as renewalPolicy from "../renewalPolicy.js";
import type * as security from "../security.js";
import type * as seed from "../seed.js";
import type * as subscriptionReconciliation from "../subscriptionReconciliation.js";
import type * as telemetry from "../telemetry.js";
import type * as users from "../users.js";
import type * as workspaceModules from "../workspaceModules.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accessMaintenance: typeof accessMaintenance;
  accounting: typeof accounting;
  accountingLedger: typeof accountingLedger;
  automations: typeof automations;
  brand: typeof brand;
  crons: typeof crons;
  customer: typeof customer;
  domain: typeof domain;
  gymApplications: typeof gymApplications;
  health: typeof health;
  http: typeof http;
  identity: typeof identity;
  invariants: typeof invariants;
  invitations: typeof invitations;
  managementReports: typeof managementReports;
  marketing: typeof marketing;
  media: typeof media;
  mediaSanitizer: typeof mediaSanitizer;
  membershipJobs: typeof membershipJobs;
  notificationDelivery: typeof notificationDelivery;
  operationalEmail: typeof operationalEmail;
  operations: typeof operations;
  permissions: typeof permissions;
  platformGymDetail: typeof platformGymDetail;
  platformOverview: typeof platformOverview;
  platformPlanCatalog: typeof platformPlanCatalog;
  platformProvisioning: typeof platformProvisioning;
  platformProvisioningAction: typeof platformProvisioningAction;
  ptJobs: typeof ptJobs;
  publicAbuse: typeof publicAbuse;
  reconciliation: typeof reconciliation;
  renewalJobs: typeof renewalJobs;
  renewalPolicy: typeof renewalPolicy;
  security: typeof security;
  seed: typeof seed;
  subscriptionReconciliation: typeof subscriptionReconciliation;
  telemetry: typeof telemetry;
  users: typeof users;
  workspaceModules: typeof workspaceModules;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
