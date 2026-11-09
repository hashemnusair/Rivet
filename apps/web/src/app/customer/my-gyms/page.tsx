"use client";
import { useLocale, useT } from "@/lib/i18n/provider";

import { ArrowRight, QrCode, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { EntryPassDialog } from "@/components/public/entry-pass-dialog";
import { GymMark } from "@/components/public/gym-mark";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/ui/states";
import type { CustomerMembership, MarketplaceGym, TrialBooking } from "@/lib/public/experience-data";
import { isDayPassBooking } from "@/lib/domain/day-pass";
import { isolate } from "@/lib/i18n/bidi";
import { useFormat } from "@/lib/i18n/format";
import { membershipDisplayStatus } from "@/lib/public/membership-status";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useCustomerPersona, useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { replaceQueryInPlace } from "@/lib/routing/replace-query";

export default function MemberDashboardPage() {
  return (
    <Suspense fallback={<GateLoading />}>
      <MemberHome />
    </Suspense>
  );
}

function MemberHome() {
  const t = useT();
  const customer = useCustomerPersona();
  const { customerMemberships, customerBookings, experienceStatus } = useExperience();
  const gyms = useMarketplaceGyms();
  const { ready, identitySignedIn, profileSelected } = useMemberGate();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [passFor, setPassFor] = useState<CustomerMembership>();
  const shortcutHandled = useRef(false);

  // Installed-app shortcuts land here with a query. "entry=1" opens the pass
  // straight away; "section=pt|classes" continues into the one membership
  // that owns that section. With several gyms the member chooses first.
  useEffect(() => {
    if (shortcutHandled.current || !ready || !profileSelected || !customer || experienceStatus !== "ready") return;
    const entry = searchParams.get("entry") === "1";
    const section = searchParams.get("section");
    if (!entry && !section) return;
    shortcutHandled.current = true;
    const only = customerMemberships.length === 1 ? customerMemberships[0] : undefined;
    if ((section === "pt" || section === "classes") && only) {
      router.replace(`/customer/my-gyms/${only.id}?section=${section}`);
      return;
    }
    if (entry && customerMemberships[0]) setPassFor(customerMemberships[0]);
  }, [customer, customerMemberships, experienceStatus, profileSelected, ready, router, searchParams]);

  if (!ready || !identitySignedIn) return <GateLoading />;
  if (!profileSelected || !customer) return <SignedOut />;

  const gymFor = (id: string) => gyms.find((gym) => gym.id === id);
  const count = customerMemberships.length;
  const closePass = (open: boolean) => {
    if (open) return;
    setPassFor(undefined);
    if (searchParams.get("entry")) replaceQueryInPlace(router, "/customer/my-gyms");
  };

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header>
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">{t("memberExperience.greeting", { name: customer.name.split(" ")[0] ?? customer.name })}</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">
          {count > 0 ? t("memberExperience.homeDescription") : t("memberExperience.homeEmptyDescription")}
        </p>
      </header>

      <section className="mt-7" aria-labelledby="subscribed-gyms-title">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="subscribed-gyms-title" className="text-[17px] font-semibold">{t("memberExperience.yourGyms")}</h2>
          <span className="text-[12px] tabular text-ink-3">{t("memberExperience.gymCount", { count })}</span>
        </div>
        {count > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {customerMemberships.map((membership) => (
              <MembershipPass key={membership.id} membership={membership} gym={gymFor(membership.gymId)} onShowPass={() => setPassFor(membership)} />
            ))}
          </div>
        ) : (
          <StatePanel
            layout="page"
            className="mt-3"
            icon={Search}
            title={t("memberExperience.noMemberships")}
            description={t("memberExperience.findGymDescription")}
            action={<Button asChild><Link href="/customer/discover"><Search />{" "}{t("marketing.actions.findGym")}</Link></Button>}
          />
        )}
      </section>

      <OpenRequests bookings={customerBookings} gymFor={gymFor} />

      {passFor ? (
        <EntryPassDialog
          open
          onOpenChange={closePass}
          membershipId={passFor.id}
          memberNumber={passFor.memberNumber}
          timeZone={passFor.timezone}
          gymName={passFor.gymName ?? gymFor(passFor.gymId)?.name ?? t("memberExperience.yourGym")}
        />
      ) : null}
    </main>
  );
}

function MembershipPass({ membership, gym, onShowPass }: { membership: CustomerMembership; gym?: MarketplaceGym; onShowPass: () => void }) {
  const { t, locale } = useLocale();
  const name = membership.gymName ?? gym?.name ?? t("memberExperience.gym");
  const status = membershipDisplayStatus(membership, undefined, { locale, timeZone: membership.timezone });
  const cover = membership.gymCoverUrl ?? gym?.cover?.url;
  const branch = membership.branchName ?? gym?.branches.find((item) => item.id === membership.branchId)?.name;
  const href = `/customer/my-gyms/${membership.id}`;
  return (
    <article className="panel overflow-hidden" aria-labelledby={`membership-${membership.id}-title`}>
      {cover ? <div className="h-24 bg-cover bg-center" role="img" aria-label={t("memberExperience.cover", { gym: name })} style={{ backgroundImage: `url(${cover})` }} /> : null}
      <div className="flex items-start gap-3 p-4">
        <GymMark name={name} shortName={gym?.shortName} logoUrl={membership.gymLogoUrl ?? gym?.logo?.url} accent={gym?.accent} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={`membership-${membership.id}-title`} className="text-[16px] font-semibold leading-tight">
              <Link href={href} className="rounded-xs hover:underline">{name}</Link>
            </h3>
            <StatusChip tone={status.tone} dot>{status.label}</StatusChip>
          </div>
          <p className="mt-1 text-[13px] text-ink-2">{membership.planName}{branch ? ` · ${branch}` : ""}</p>
          <p className={cn("mt-0.5 text-[13px]", status.ended ? "text-danger" : status.key === "ending" ? "text-warning-deep" : "text-ink-3")}>{status.summary}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button size="sm" onClick={onShowPass}><QrCode /> {t("memberExperience.entryCode")}</Button>
        <Button asChild size="sm" variant="secondary"><Link href={href}>{t("memberProfile.followUp.membershipFallback")}{" "}<ArrowRight className="rtl:rotate-180" /></Link></Button>
        <bdi dir="ltr" className="ms-auto font-mono text-[12px] text-ink-3">{membership.memberNumber}</bdi>
      </div>
    </article>
  );
}

/**
 * Trial and day-pass requests the gym has not closed yet, newest day first. A
 * day pass says whether it is paid and, if not, how to pay (the CliQ alias
 * comes from the gym's current public offer).
 */
function OpenRequests({ bookings, gymFor }: { bookings: TrialBooking[]; gymFor: (id: string) => MarketplaceGym | undefined }) {
  const t = useT();
  const f = useFormat();
  const open = bookings
    .filter((booking) => booking.status === "requested" || booking.status === "confirmed")
    .sort((left, right) => left.preferredDate.localeCompare(right.preferredDate));
  if (open.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="open-requests-title" data-testid="open-requests">
      <h2 id="open-requests-title" className="text-[17px] font-semibold">{t("memberExperience.requestsTitle")}</h2>
      <ul className="panel mt-3 divide-y divide-line overflow-hidden">
        {open.map((booking) => {
          const gym = gymFor(booking.gymId);
          const branch = gym?.branches.find((item) => item.id === booking.branchId)?.name;
          const dayPass = isDayPassBooking(booking);
          const price = booking.price ? f.money(booking.price) : "";
          const alias = gym?.trialOffer?.cliqAlias;
          const paymentLine = !dayPass
            ? undefined
            : booking.paymentStatus === "paid"
              ? t("memberExperience.requestPaid", { price })
              : booking.paymentMethod === "cliq"
                ? alias ? t("memberExperience.requestPayCliq", { price, alias: isolate(alias) }) : t("memberExperience.requestPayCliqNoAlias", { price })
                : t("memberExperience.requestPayCash", { price });
          return (
            <li key={booking.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[14px] font-semibold">{dayPass ? t("memberExperience.requestDayPass") : t("memberExperience.requestFreeTrial")}</span>
                <StatusChip tone={booking.status === "confirmed" ? "green" : "amber"} dot>{booking.status === "confirmed" ? t("memberExperience.requestConfirmed") : t("memberExperience.requestWaiting")}</StatusChip>
              </div>
              <p className="mt-1 text-[13px] text-ink-2">
                {gym?.name ?? t("memberExperience.gym")}{branch ? ` · ${branch}` : ""}{" · "}<bdi>{f.date(booking.preferredDate)}</bdi>{dayPass ? null : <>{" · "}<bdi>{f.clock(booking.preferredTime)}</bdi></>}
              </p>
              {paymentLine ? <p className={cn("mt-1 text-[12.5px]", booking.paymentStatus === "paid" ? "text-success-deep" : "text-ink-3")}>{paymentLine}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GateLoading() {
  const t = useT();
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4" role="status" aria-label={t("memberExperience.checkingAccess")}>
      <div className="h-1 w-40 animate-pulse rounded-full bg-sunken-2" />
    </main>
  );
}

function SignedOut() {
  const t = useT();
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg border border-line-2 bg-surface text-ink-2"><UserRound className="size-5" aria-hidden /></span>
      <h1 className="mt-5 font-display text-[22px] font-semibold tracking-tight">{t("memberExperience.memberSignIn")}</h1>
      <p className="mt-2 text-[13.5px] text-ink-2">{t("memberExperience.memberSignInDescription")}</p>
      <div className="mt-6 flex gap-2">
        <Button asChild><Link href="/login">{t("common.action.signIn")}</Link></Button>
        <Button asChild variant="secondary"><Link href="/login/member/create">{t("memberExperience.createAccount")}</Link></Button>
      </div>
    </main>
  );
}
