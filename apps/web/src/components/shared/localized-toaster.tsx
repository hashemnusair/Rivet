"use client";

import { Toaster } from "sonner";
import { useLocale } from "@/lib/i18n/provider";

export function LocalizedToaster() {
  const { dir, t } = useLocale();
  return <Toaster dir={dir} position={dir === "rtl" ? "bottom-left" : "bottom-right"}
    containerAriaLabel={t("nav.aria.notifications")}
    toastOptions={{ closeButtonAriaLabel: t("common.action.close"), style: {
      background: "#15140f", color: "#f2f0e6", border: "1px solid #2e2c22", borderRadius: "6px", fontSize: "13px",
    } }} />;
}
