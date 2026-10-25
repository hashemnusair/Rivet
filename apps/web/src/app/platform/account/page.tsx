"use client";

import Link from "next/link";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { Button } from "@/components/ui/button";
import { PlatformPage, PlatformPanel, PlatformPanelHeader } from "@/components/platform/platform-page";
import { PageHeader } from "@/components/shared/chrome";
import { useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useLocale, useT } from "@/lib/i18n/provider";

/** The signed-in RIVET administrator's own account: who they are signed in as
 * and their password. Reached from the name in the console header. */
export default function PlatformAccountPage() {
  const t = useT();
  const { isolate, isolateLtr } = useLocale();
  const identity = useRivetIdentity();
  const name = identity.fullName?.trim();
  const email = identity.email?.trim();

  return (
    <PlatformPage className="space-y-5" data-testid="platform-account">
      <PageHeader title={t("platformConsole.account.title")} description={t("platformConsole.account.description")} />
      <div className="max-w-3xl space-y-5">
        <PlatformPanel aria-labelledby="platform-account-details">
          <PlatformPanelHeader id="platform-account-details" title={t("platformConsole.account.detailsTitle")} />
          <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
            <div className="min-w-0">
              <dt className="text-[12px] font-medium text-ink-3">{t("platformConsole.account.name")}</dt>
              <dd className="mt-1 truncate text-[13.5px] font-medium text-ink">{name ? isolate(name) : "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[12px] font-medium text-ink-3">{t("platformConsole.account.email")}</dt>
              <dd className="mt-1 truncate text-[13.5px] text-ink">{email ? isolateLtr(email) : "—"}</dd>
            </div>
          </dl>
        </PlatformPanel>
        <PlatformPanel aria-labelledby="platform-account-assistance">
          <PlatformPanelHeader id="platform-account-assistance" title={t("aiWork.platformControl.link")} description={t("aiWork.platformControl.linkHint")} actions={<Button asChild variant="secondary" size="sm"><Link href="/platform/assistance" data-testid="platform-assistance-link">{t("aiWork.artifact.open")}</Link></Button>} />
        </PlatformPanel>
        <PlatformPanel aria-labelledby="platform-account-password">
          <PlatformPanelHeader id="platform-account-password" title={t("auth.changePassword.title")} description={t("auth.changePassword.description")} />
          <div className="px-4 py-4 sm:px-5">
            <ChangePasswordForm idPrefix="platform-password" />
          </div>
        </PlatformPanel>
      </div>
    </PlatformPage>
  );
}
