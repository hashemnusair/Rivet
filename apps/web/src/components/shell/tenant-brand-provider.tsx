"use client";

import type { CSSProperties, ReactNode } from "react";
import { useApp } from "@/lib/providers/app-providers";

const fallbackTokens = {
  "--tenant-brand-primary": "#15140f",
  "--tenant-brand-primary-hover": "#0f0f0c",
  "--tenant-brand-primary-foreground": "#ffffff",
  "--tenant-brand-primary-soft": "#e9e9e7",
  "--tenant-brand-primary-soft-foreground": "#15140f",
  "--tenant-brand-focus": "#15140f",
} as const;

/** Applies only server-derived data tokens to the authenticated gym shell. */
export function TenantBrandProvider({ children }: { children: ReactNode }) {
  const brand = useApp().session?.organization.brand;
  const tokens = brand?.tokens;
  const style = {
    ...fallbackTokens,
    ...(tokens
      ? {
          "--tenant-brand-primary": tokens.primary,
          "--tenant-brand-primary-hover": tokens.primaryHover,
          "--tenant-brand-primary-foreground": tokens.primaryForeground,
          "--tenant-brand-primary-soft": tokens.primarySoft,
          "--tenant-brand-primary-soft-foreground": tokens.primarySoftForeground,
          "--tenant-brand-focus": tokens.focusRing,
        }
      : {}),
  } as CSSProperties;

  return (
    <div data-tenant-brand data-brand-palette={brand?.paletteKey ?? "rivet"} style={style}>
      {children}
    </div>
  );
}
