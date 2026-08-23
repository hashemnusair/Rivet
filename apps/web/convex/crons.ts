import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("evaluate GymOS automation rules", { minutes: 15 }, internal.automations.evaluate, {});
crons.interval("process enabled operational email", { minutes: 1 }, internal.operationalEmail.processDue, {});
crons.interval("queue upcoming PT reminders", { minutes: 15 }, internal.ptJobs.queueUpcomingReminders, {});
crons.interval("queue membership lifecycle reminders", { hours: 1 }, internal.membershipJobs.queueLifecycleReminders, {});
crons.interval("queue renewal recovery journey", { minutes: 15 }, internal.renewalJobs.queueRenewalJourney, {});
crons.interval("reconcile platform subscriptions", { hours: 1 }, internal.subscriptionReconciliation.reconcile, {});
crons.daily("clean expired profile media", { hourUTC: 2, minuteUTC: 20 }, internal.media.cleanupExpired, {});

export default crons;
