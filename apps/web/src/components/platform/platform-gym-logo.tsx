"use client";

import { useEffect, useState } from "react";

type PlatformGymLogoProps = {
  name: string;
  shortName: string;
  accent: string;
  logoUrl?: string;
  className?: string;
};

/** Small, remote-URL-safe logo surface for platform tenant views. A broken
 * or missing asset falls back to deterministic initials without changing the
 * tenant identity or inventing a replacement image. */
export function PlatformGymLogo({ name, shortName, accent, logoUrl, className = "size-12" }: PlatformGymLogoProps) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const hasLogo = Boolean(logoUrl && failedUrl !== logoUrl);

  useEffect(() => {
    setFailedUrl(undefined);
  }, [logoUrl]);

  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden font-mono text-[10.5px] font-semibold text-white ${className}`} style={{ backgroundColor: accent }} role="img" aria-label={`${name} logo`}>
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="absolute inset-0 size-full object-cover" onError={() => setFailedUrl(logoUrl)} />
      ) : <span aria-hidden>{gymInitials(name, shortName)}</span>}
    </span>
  );
}

export function gymInitials(name: string, shortName: string): string {
  const value = (name || shortName).trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return (shortName.trim() || value).slice(0, 3).toUpperCase();
}
