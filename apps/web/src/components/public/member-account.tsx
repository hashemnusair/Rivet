"use client";

import { ArrowLeft, Ellipsis, GraduationCap, KeyRound, LogOut, MessageSquare, SquarePlus } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { useMemberAppInstall } from "@/components/pwa/member-app";
import { LanguageMenuItem } from "@/components/shared/language-switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n/provider";

/**
 * The member's account: the profile page shows who they are and what their
 * gyms see, with "Edit info" beside it; everything else about the account
 * (password, offers and news, screen language, the guide, the home-screen
 * app, signing out) sits behind the ⋯ at the top of that page.
 */
export const MEMBER_ACCOUNT_HREF = "/customer/profile";
export const MEMBER_ACCOUNT_PAGES = {
  edit: `${MEMBER_ACCOUNT_HREF}/edit`,
  password: `${MEMBER_ACCOUNT_HREF}/password`,
  offers: `${MEMBER_ACCOUNT_HREF}/offers`,
} as const;

/** The member shell owns signing out (it covers the screen while it happens). */
const MemberSignOutContext = createContext<() => void>(() => undefined);
export const MemberSignOutProvider = MemberSignOutContext.Provider;

const ITEM = "min-h-11 py-2.5 text-[13.5px]";

export function MemberAccountMenu() {
  const t = useT();
  const signOut = useContext(MemberSignOutContext);
  const { app, start } = useMemberAppInstall();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-ink sm:size-9" aria-label={t("customerPortal.moreOptions")}>
          <Ellipsis className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem asChild className={ITEM}>
          <Link href={MEMBER_ACCOUNT_PAGES.password}><KeyRound />{" "}{t("auth.changePassword.menu")}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link href={MEMBER_ACCOUNT_PAGES.offers}><MessageSquare />{" "}{t("publicCompletion.memberShell.offersAndNews")}</Link>
        </DropdownMenuItem>
        <LanguageMenuItem className={ITEM} />
        <DropdownMenuItem asChild className={ITEM}>
          <Link href="/customer/getting-started"><GraduationCap />{" "}{t("shell.account.gettingStarted")}</Link>
        </DropdownMenuItem>
        {app.ready && !app.standalone ? (
          <DropdownMenuItem className={ITEM} onSelect={start}>
            <SquarePlus />{" "}{t("setup.app.menuItem")}</DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive className={ITEM} onSelect={signOut}>
          <LogOut />{" "}{t("common.action.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A page one step inside the account: the way back, its title, then its content. */
export function MemberAccountSubpage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const t = useT();
  return (
    <main className="mx-auto max-w-[720px] px-4 py-4 sm:px-6 lg:px-8 lg:py-10">
      <Link href={MEMBER_ACCOUNT_HREF} className="-ms-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("customerPortal.backToProfile")}
      </Link>
      <h1 className="mt-2 font-display text-[24px] font-semibold leading-tight tracking-tight text-ink sm:text-[26px]">{title}</h1>
      {description ? <p className="mt-1 text-[13.5px] text-ink-2">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </main>
  );
}

export function MemberAccountLoading() {
  const t = useT();
  return <main className="flex min-h-[60vh] items-center justify-center px-4" role="status" aria-label={t("customerPortal.loadingProfile")}><div className="h-1 w-40 animate-pulse rounded-full bg-sunken-2" /></main>;
}
