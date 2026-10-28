import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("evaluate GymOS automation rules", { minutes: 15 }, internal.automations.evaluate, {});
crons.interval("process enabled operational email", { minutes: 1 }, internal.operationalEmail.processDue, {});
crons.interval("queue upcoming PT reminders", { minutes: 15 }, internal.ptJobs.queueUpcomingReminders, {});
crons.interval("queue membership lifecycle reminders", { hours: 1 }, internal.membershipJobs.queueLifecycleReminders, {});
crons.interval("queue renewal staff call tasks", { minutes: 15 }, internal.renewalJobs.queueRenewalJourney, {});
crons.interval("reconcile platform subscriptions", { hours: 1 }, internal.subscriptionReconciliation.reconcile, {});
crons.daily("clean expired profile media", { hourUTC: 2, minuteUTC: 20 }, internal.media.cleanupExpired, {});
crons.interval("clean public request controls", { hours: 1 }, internal.publicAbuse.cleanupExpired, {});
crons.interval("purge expired export files", { hours: 1 }, internal.qolMaintenance.purgeExpiredExports, {});
crons.interval("backfill customer membership identity", { minutes: 15 }, internal.qolMaintenance.backfillCustomerMembershipIdentity, {});
crons.interval("backfill member visit summaries", { minutes: 15 }, internal.qolMaintenance.backfillMemberVisits, {});

crons.interval("resume delegated work after a stopped worker", { minutes: 1 }, internal.aiRuns.recoverExpiredLeases, {});
crons.interval("start due standing instructions", { minutes: 5 }, internal.aiRuns.dispatchStanding, {});
crons.interval("expire prepared reports and handovers", { hours: 1 }, internal.aiRuns.expireArtifacts, {});
crons.interval("expire kept assistant readings", { minutes: 15 }, internal.aiActions.expireModelAnswers, {});
crons.interval("remove Ask RIVET conversations past retention", { hours: 1 }, internal.aiChat.expireChats, {});

export default crons;
