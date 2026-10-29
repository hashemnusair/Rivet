"use client";
import { useFormat } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";

import { PenLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MEMBER_ACCOUNT_PAGES, MemberAccountLoading, MemberAccountMenu } from "@/components/public/member-account";
import { Button } from "@/components/ui/button";
import { Monogram } from "@/components/ui/misc";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useCustomerPersona } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

/** The account menu used to open sections of this page; those are pages of their own now. */
const MOVED_SECTIONS: Record<string, string> = {
  "#password": MEMBER_ACCOUNT_PAGES.password,
  "#communication": MEMBER_ACCOUNT_PAGES.offers,
};

/**
 * The member's own record, read-only: everything their gyms see, with "Edit
 * info" to change it. The rest of the account lives behind the ⋯ beside the
 * title.
 */
export default function MemberProfilePage() {
  const t = useT();
  const f = useFormat();
  const router = useRouter();
  const customer = useCustomerPersona();
  const { ready, identitySignedIn, profileSelected } = useMemberGate();

  useEffect(() => {
    const moved = MOVED_SECTIONS[window.location.hash];
    if (moved) router.replace(moved);
  }, [router]);

  if (!ready || !identitySignedIn) return <MemberAccountLoading />;
  if (!profileSelected || !customer) return null;

  const language = customer.preferredLanguage === "ar" ? t("common.language.arabic") : t("common.language.english");
  const gender = customer.gender === "female" ? t("memberProfile.details.female") : customer.gender === "male" ? t("memberProfile.details.male") : undefined;

  return (
    <main className="mx-auto max-w-[720px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">{t("marketing.memberShell.profile")}</h1>
        <MemberAccountMenu />
      </header>

      <section className="panel mt-4 p-5" aria-label={customer.name}>
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
          <Monogram name={customer.name} size="xl" />
          <div className="min-w-0 max-w-full flex-1">
            <p dir="auto" className="break-words text-[19px] font-semibold leading-tight text-ink">{customer.name}</p>
            <p className="mt-1 truncate text-[13px] text-ink-3"><bdi dir="ltr">{customer.email}</bdi></p>
          </div>
          <Button asChild variant="secondary" className="h-11 w-full sm:h-9 sm:w-auto">
            <Link href={MEMBER_ACCOUNT_PAGES.edit}><PenLine aria-hidden />{" "}{t("customerPortal.editInfo")}</Link>
          </Button>
        </div>
      </section>

      <DetailsSection
        id="profile-personal"
        title={t("customerPortal.personalInformation")}
        rows={[
          { label: t("common.label.phone"), value: customer.phone, ltr: true },
          { label: t("customerPortal.birthDate"), value: customer.dateOfBirth ? f.date(customer.dateOfBirth) : undefined },
          { label: t("memberProfile.details.gender"), value: gender },
          { label: t("members.header.preferredLanguage"), value: language },
        ]}
      />
      <DetailsSection
        id="profile-address"
        title={t("memberProfile.details.address")}
        rows={[
          { label: t("memberProfile.details.address"), value: customer.addressLine1 },
          { label: t("customerPortal.city"), value: customer.city },
        ]}
      />
      <DetailsSection
        id="profile-emergency"
        title={t("members.header.emergencyContact")}
        hint={customer.emergencyContactPhone ? undefined : t("customerPortal.emergencyHint")}
        rows={[
          { label: t("common.label.name"), value: customer.emergencyContactName },
          { label: t("customerPortal.relationship"), value: customer.emergencyContactRelationship },
          { label: t("common.label.phone"), value: customer.emergencyContactPhone, ltr: true },
        ]}
      />

      <section className="mt-6 px-1" aria-labelledby="profile-privacy-title">
        <h2 id="profile-privacy-title" className="text-[13px] font-semibold text-ink">{t("customerPortal.profilePrivacyTitle")}</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{t("customerPortal.profilePrivacy")}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{t("customerPortal.profileStaffDetails")}</p>
      </section>
    </main>
  );
}

function DetailsSection({ id, title, hint, rows }: { id: string; title: string; hint?: string; rows: Array<{ label: string; value?: string; ltr?: boolean }> }) {
  const t = useT();
  return (
    <section className="panel mt-4 px-4 pt-4 sm:px-5" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-[15px] font-semibold">{title}</h2>
      {hint ? <p className="mt-1 text-[12.5px] text-ink-3">{hint}</p> : null}
      <dl className="mt-2 divide-y divide-line">
        {rows.map((row) => {
          const value = row.value?.trim();
          return (
            <div key={row.label} className="flex min-h-12 items-baseline justify-between gap-4 py-3">
              <dt className="shrink-0 text-[13px] text-ink-3">{row.label}</dt>
              <dd className={cn("min-w-0 break-words text-end text-[13.5px]", value ? "font-medium text-ink" : "text-ink-3")}>
                {value ? row.ltr ? <bdi dir="ltr">{value}</bdi> : <span dir="auto">{value}</span> : t("customerPortal.notAdded")}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
