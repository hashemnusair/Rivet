"use client";
import { useT } from "@/lib/i18n/provider";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/misc";
import { NotFoundState } from "@/components/ui/states";
import ReceiptPageClient from "../[receiptId]/receipt.client";

function receiptIdFromHash(): string | undefined {
  const value = window.location.hash.slice(1);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export default function RuntimeReceiptPage() {
  const t = useT();
  const [receiptId, setReceiptId] = useState<string>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setReceiptId(receiptIdFromHash());
      setReady(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  if (!ready) return <Skeleton className="mx-auto h-[540px] w-full max-w-md" />;
  if (!receiptId) return <NotFoundState title={t("salesWorkspace.incompleteReceipt")} />;
  return <ReceiptPageClient receiptId={receiptId} />;
}
