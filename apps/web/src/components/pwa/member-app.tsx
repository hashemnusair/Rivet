"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/provider";
import { markMemberAppAdded, promptInstall, snoozeMemberAppReminder, useMemberApp, type MemberAppState } from "@/lib/pwa/use-member-app";
import { MemberAppGuide } from "./member-app-guide";

type MemberAppContext = {
  app: MemberAppState;
  /** The browser's own prompt where there is one, otherwise the step-by-step guide. */
  start: () => void;
};

const Context = createContext<MemberAppContext | null>(null);

export function useMemberAppInstall(): MemberAppContext {
  const value = useContext(Context);
  if (!value) throw new Error("useMemberAppInstall needs MemberAppProvider");
  return value;
}

/**
 * One owner for "put RIVET on my phone": the reminder bar, the account menu
 * and the getting-started guide all start the same way and share one guide.
 */
export function MemberAppProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const app = useMemberApp();
  const [guideOpen, setGuideOpen] = useState(false);

  const prompt = useCallback(async () => {
    try {
      const outcome = await promptInstall();
      if (outcome === "accepted") { setGuideOpen(false); toast.success(t("setup.app.installed")); }
      // The browser can take its prompt back; the written steps still work.
      if (outcome === "unavailable") setGuideOpen(true);
    } catch {
      toast.error(t("setup.installFailed"));
      setGuideOpen(true);
    }
  }, [t]);

  const start = useCallback(() => {
    if (app.canPrompt && !app.platform.inApp) void prompt();
    else setGuideOpen(true);
  }, [app.canPrompt, app.platform.inApp, prompt]);

  const alreadyAdded = () => {
    markMemberAppAdded();
    setGuideOpen(false);
    toast.success(t("setup.app.remindersStopped"));
  };

  const value = useMemo(() => ({ app, start }), [app, start]);

  return (
    <Context.Provider value={value}>
      {children}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-md" data-member-app-guide>
          <DialogHeader className="pe-12">
            <DialogTitle>{t("setup.app.guideTitle")}</DialogTitle>
            <DialogDescription>{t("setup.app.guideDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <MemberAppGuide app={app} onPrompt={() => void prompt()} />
          </DialogBody>
          {!app.standalone && !app.added ? (
            <DialogFooter className="justify-start">
              <Button size="sm" variant="ghost" onClick={alreadyAdded}>{t("setup.app.alreadyAdded")}</Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}

/**
 * Asks members on a phone to add RIVET to the home screen. "Not now" hides it
 * for 3, 7, 14, then 30 days at a time, so it keeps coming back until the app
 * is added. It never shows inside the installed app.
 */
export function MemberAppReminder() {
  const t = useT();
  const pathname = usePathname();
  const { app, start } = useMemberAppInstall();
  const show = app.ready && !app.standalone && !app.added && app.reminderDue && app.platform.device !== "computer" && pathname !== "/customer/getting-started";
  if (!show) return null;

  return (
    <section className="border-b border-line bg-surface px-4 py-2.5 sm:px-6 lg:px-8" aria-labelledby="member-app-reminder-title" data-member-app-reminder>
      <div className="mx-auto flex max-w-[1280px] items-center gap-3">
        <Image src="/icons/member-192.png" alt="" width={36} height={36} className="size-9 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <p id="member-app-reminder-title" className="text-[13px] font-semibold leading-snug text-ink">{t("setup.app.reminderTitle")}</p>
          <p className="text-[12px] leading-snug text-ink-2">{t("setup.app.reminderBody")}</p>
        </div>
        <Button size="sm" className="shrink-0" onClick={start}>{app.canPrompt && !app.platform.inApp ? t("setup.app.add") : t("setup.app.showMe")}</Button>
        <button
          type="button"
          className="-me-2 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
          aria-label={t("setup.app.notNow")}
          title={t("setup.app.notNow")}
          onClick={snoozeMemberAppReminder}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}
