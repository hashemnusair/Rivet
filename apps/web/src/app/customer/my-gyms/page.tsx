"use client";

import { ArrowRight, QrCode, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { EntryPassDialog } from "@/components/public/entry-pass-dialog";
import { GymMark } from "@/components/public/gym-mark";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/ui/states";
import type { CustomerMembership, MarketplaceGym } from "@/lib/public/experience-data";
import { membershipDisplayStatus } from "@/lib/public/membership-status";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useCustomerPersona, useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

export default function MemberDashboardPage() {
  return (
    <Suspense fallback={<GateLoading />}>
      <MemberHome />
    </Suspense>
  );
}

function MemberHome() {
  const customer = useCustomerPersona();
  const { customerMemberships, experienceStatus } = useExperience();
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
    if (searchParams.get("entry")) router.replace("/customer/my-gyms", { scroll: false });
  };

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header>
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">Hi, {customer.name.split(" ")[0]}</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">
          {count > 0 ? "Your entry pass and memberships, ready when you are." : "Your memberships appear here as soon as a gym activates one."}
        </p>
      </header>

      <section className="mt-7" aria-labelledby="subscribed-gyms-title">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="subscribed-gyms-title" className="text-[17px] font-semibold">Subscribed gyms</h2>
          <span className="text-[12px] tabular text-ink-3">{count} {count === 1 ? "gym" : "gyms"}</span>
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
            title="No gym membership yet"
            description="Find a gym on RIVET and book a free trial. Your membership appears here as soon as the gym activates it."
            action={<Button asChild><Link href="/customer/discover"><Search /> Find a gym</Link></Button>}
          />
        )}
      </section>

      {passFor ? (
        <EntryPassDialog
          open
          onOpenChange={closePass}
          membershipId={passFor.id}
          memberNumber={passFor.memberNumber}
          gymName={passFor.gymName ?? gymFor(passFor.gymId)?.name ?? "Your gym"}
        />
      ) : null}
    </main>
  );
}

function MembershipPass({ membership, gym, onShowPass }: { membership: CustomerMembership; gym?: MarketplaceGym; onShowPass: () => void }) {
  const name = membership.gymName ?? gym?.name ?? "Gym";
  const status = membershipDisplayStatus(membership);
  const cover = membership.gymCoverUrl ?? gym?.cover?.url;
  const branch = membership.branchName ?? gym?.branches.find((item) => item.id === membership.branchId)?.name;
  const href = `/customer/my-gyms/${membership.id}`;
  return (
    <article className="panel overflow-hidden" aria-labelledby={`membership-${membership.id}-title`}>
      {cover ? <div className="h-24 bg-cover bg-center" role="img" aria-label={`${name} cover image`} style={{ backgroundImage: `url(${cover})` }} /> : null}
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
        <Button size="sm" onClick={onShowPass}><QrCode /> Entry QR</Button>
        <Button asChild size="sm" variant="secondary"><Link href={href}>Membership <ArrowRight /></Link></Button>
        <span className="ms-auto font-mono text-[12px] text-ink-3">{membership.memberNumber}</span>
      </div>
    </article>
  );
}

function GateLoading() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4" role="status" aria-label="Checking access">
      <div className="h-1 w-40 animate-pulse rounded-full bg-sunken-2" />
    </main>
  );
}

function SignedOut() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg border border-line-2 bg-surface text-ink-2"><UserRound className="size-5" aria-hidden /></span>
      <h1 className="mt-5 font-display text-[22px] font-semibold tracking-tight">Sign in to your member account</h1>
      <p className="mt-2 text-[13.5px] text-ink-2">Your gym memberships and personal profile are available after sign in.</p>
      <div className="mt-6 flex gap-2">
        <Button asChild><Link href="/login">Sign in</Link></Button>
        <Button asChild variant="secondary"><Link href="/login/member/create">Create an account</Link></Button>
      </div>
    </main>
  );
}
