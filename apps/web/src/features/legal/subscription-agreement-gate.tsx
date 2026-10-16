"use client";

import { lazy, Suspense, useState } from "react";

/**
 * The signing flow (form, signature pad, agreement text in both languages)
 * loads only for an owner who still has to sign, not with every workspace
 * screen.
 */
const SubscriptionAgreementModal = lazy(() => import("./subscription-agreement-modal").then((module) => ({ default: module.SubscriptionAgreementModal })));

/**
 * Mounted by the app shell. While the session says the owner still owes a
 * signature, the modal covers the workspace and cannot be closed. After a
 * successful signing it stays open on the confirmation until the owner
 * continues, even though the refreshed session no longer requires it.
 */
export function SubscriptionAgreementGate({ required }: { required: boolean }) {
  const [holdOpen, setHoldOpen] = useState(false);
  if (!required && !holdOpen) return null;
  // While the flow loads, an invisible layer keeps the workspace out of reach
  // without drawing anything the modal's own fade-in would then repeat.
  return (
    <Suspense fallback={<div aria-hidden className="fixed inset-0 z-50" data-testid="agreement-gate-loading" />}>
      <SubscriptionAgreementModal onSigned={() => setHoldOpen(true)} onFinished={() => setHoldOpen(false)} />
    </Suspense>
  );
}
