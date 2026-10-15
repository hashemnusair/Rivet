"use client";

import { useT } from "@/lib/i18n/provider";
import { RIVET_IN_BETA } from "@/lib/release/beta";
import { RIVET_CONTACT } from "@/lib/rivet-contact";
import { cn } from "@/lib/utils/cn";

/**
 * The "Beta" mark beside the RIVET lockup. It takes the colour of the text
 * around it, so the one mark works on paper, night and the landing film.
 */
export function BetaBadge({ className }: { className?: string }) {
  const t = useT();
  if (!RIVET_IN_BETA) return null;
  return (
    <span
      data-testid="beta-badge"
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-[4px] border border-current/35 px-1.5 text-[12px] font-semibold leading-none text-current/80",
        className,
      )}
    >
      {t("common.beta.label")}
    </span>
  );
}

/** The full beta notice for public pages and sign-in. */
export function BetaNotice({ className }: { className?: string }) {
  const t = useT();
  if (!RIVET_IN_BETA) return null;
  return (
    <p data-testid="beta-notice" className={className}>
      {t("common.beta.notice")}
    </p>
  );
}

/** The gym workspace's short beta line, with a way to tell RIVET about a problem. */
export function BetaNote({ className }: { className?: string }) {
  const t = useT();
  if (!RIVET_IN_BETA) return null;
  return (
    <p data-testid="beta-note" className={cn("text-[12px] leading-snug text-night-ink-3", className)}>
      {t("common.beta.short")}{" "}
      <a href={RIVET_CONTACT.whatsappHref} target="_blank" rel="noreferrer" className="text-night-ink-2 underline underline-offset-2 transition-colors hover:text-night-ink">
        {t("common.beta.reportProblem")}
      </a>
    </p>
  );
}
