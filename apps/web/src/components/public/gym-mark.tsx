import { cn } from "@/lib/utils/cn";

const SIZES = {
  sm: "size-9 text-[9px]",
  md: "size-11 text-[10px]",
  lg: "size-14 text-[10.5px]",
} as const;

/**
 * A gym's mark inside the member portal: the uploaded logo when one exists,
 * otherwise the gym's short name on its controlled accent. It stays a compact
 * tile so a gym without media never becomes a wall of accent color.
 */
export function GymMark({
  name,
  shortName,
  logoUrl,
  accent,
  size = "md",
  className,
}: {
  name: string;
  shortName?: string;
  logoUrl?: string;
  accent?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initials = (shortName ?? name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || name.slice(0, 2).toUpperCase();
  // A short brand word ("FORGE", "PULSE") reads better than its initial when
  // the tile has room for it; the small tile keeps to initials.
  const word = shortName?.trim();
  const fallback = word && word.length <= 5 && size !== "sm" ? word.toUpperCase() : initials;
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-cover bg-center font-mono font-semibold uppercase tracking-[0.08em] text-white", SIZES[size], className)}
      style={{ backgroundColor: accent ?? "var(--color-ink)", backgroundImage: logoUrl ? `url(${logoUrl})` : undefined }}
      role="img"
      aria-label={`${name} logo`}
    >
      {logoUrl ? null : fallback}
    </span>
  );
}
