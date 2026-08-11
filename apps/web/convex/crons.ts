import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("evaluate GymOS automation rules", { minutes: 15 }, internal.automations.evaluate, {});
crons.interval("process enabled operational email", { minutes: 1 }, internal.operationalEmail.processDue, {});
crons.interval("queue upcoming PT reminders", { minutes: 15 }, internal.ptJobs.queueUpcomingReminders, {});
crons.daily("clean expired profile media", { hourUTC: 2, minuteUTC: 20 }, internal.media.cleanupExpired, {});

export default crons;
