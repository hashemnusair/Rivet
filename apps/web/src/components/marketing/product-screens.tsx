import { RefreshCcw, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils/cn";
import { useLocale } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

/**
 * The product, as illustration: the member app's Entry QR dialog, mirroring
 * the markup and classes of the real dialog. Nothing here is focusable or
 * live, and the code in the QR is a fixed sample rather than a signed pass.
 */

/** The value behind every drawn QR. Scanning it yields this text, never an entry. */
const SAMPLE_PASS = "RIVET entry pass — illustration only";

/** The Entry QR dialog, exactly as the member app draws it. */
export function EntryPassCard({ className }: { className?: string }) {
  const { t } = useLocale();
  const f = useFormat();
  return (
    <div className={cn("w-full max-w-sm rounded-lg border border-line bg-surface text-ink shadow-dialog", className)}>
      <div className="relative border-b border-line px-5 py-4">
        <p className="font-display text-[17px] font-semibold tracking-tight text-ink">{t("publicCompletion.preview.member.entryQr")}</p>
        <p className="mt-1 text-[13px] text-ink-2" dir="auto">Forge Fitness Club</p>
        <span className="absolute end-3 top-3 rounded-sm p-1.5 text-ink-3"><X className="size-4" /></span>
      </div>
      <div className="px-5 py-4 text-center">
        <div className="mx-auto w-fit rounded-lg border border-line bg-white p-4">
          <QRCodeSVG value={SAMPLE_PASS} size={232} level="H" bgColor="#ffffff" fgColor="#15140f" className="block h-auto w-full max-w-[232px]" />
        </div>
        <p className="mt-4 font-mono text-[18px] tracking-wide text-ink" dir="ltr">ABD-2214</p>
        <p className="mt-2 text-[13px] text-ink-2">{t("publicCompletion.preview.member.expiresAt", { time: f.clock("09:56") })}</p>
        <span className="mt-4 inline-flex h-8 items-center gap-2 rounded-md border border-line-2 bg-surface px-3 text-[13px] font-medium text-ink">
          <RefreshCcw className="size-4" /> {t("publicCompletion.preview.member.freshPass")}
        </span>
      </div>
    </div>
  );
}
