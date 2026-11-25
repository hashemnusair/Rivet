"use client";

import { WorkspaceCurtain } from "@/components/motion/workspace-curtain";
import { useT } from "@/lib/i18n/provider";

/** The cover itself. Loaded on demand, so pages that never sign anyone in do not carry it. */
export function SigningInCoverBody({ covering }: { covering: boolean }) {
  const t = useT();
  return <WorkspaceCurtain ready={!covering} label={t("auth.identity.signingIn")} arrives testId="signing-in-cover" />;
}
