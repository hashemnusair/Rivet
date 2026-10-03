"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import type { SubscriptionNotice } from "@/lib/domain/types";
import { useFormat } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";

/**
 * Money owed to RIVET, shown above the workspace to owners and managers. A
 * past-due gym keeps full access through the agreement's notice period; this
 * is where they see the amount and the day access may be suspended. The
 * server only sends a notice to those two roles.
 */
export function SubscriptionNoticeBanner() {
  const { session } = useApp();
  const notice = session?.organization.subscription?.notice;
  if (!notice) return null;
  return <NoticeBody notice={notice} />;
}

function NoticeBody({ notice }: { notice: SubscriptionNotice }) {
  const t = useT();
  const { session } = useApp();
  const { can } = usePermissions();
  const f = useFormat(session?.organization.timezone);
  const amount = notice.amount ? f.money(notice.amount) : undefined;
  const suspendsOn = notice.suspendsAt ? f.date(notice.suspendsAt) : undefined;
  const pastDue = notice.kind === "past_due";
  const title = pastDue
    ? t("shell.subscriptionNotice.pastDueTitle")
    : t("shell.subscriptionNotice.trialEndedTitle", { date: notice.trialEndedAt ? f.date(notice.trialEndedAt) : "" });
  const body = pastDue
    ? amount && suspendsOn
      ? t("shell.subscriptionNotice.pastDueAmountSuspend", { amount, date: suspendsOn })
      : amount
        ? t("shell.subscriptionNotice.pastDueAmount", { amount })
        : t("shell.subscriptionNotice.pastDueNoAmount")
    : amount && notice.dueAt && suspendsOn
      ? t("shell.subscriptionNotice.trialEndedInvoice", { amount, dueAt: f.date(notice.dueAt), date: suspendsOn })
      : t("shell.subscriptionNotice.trialEndedNoInvoice");
  return (
    <section
      aria-label={t("shell.subscriptionNotice.label")}
      role="status"
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 border-b px-4 py-3 text-[13px] sm:px-6 lg:px-8",
        pastDue ? "border-danger/30 bg-danger-bg text-danger" : "border-warning/40 bg-warning-bg text-warning-deep",
      )}
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5">{body}</p>
      </div>
      {can("settings.manage") ? (
        <Link href="/settings?section=subscription" className="shrink-0 font-medium underline underline-offset-2">
          {t("shell.subscriptionNotice.view")}
        </Link>
      ) : null}
    </section>
  );
}
