"use client";

import { RefreshCcw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getApi } from "@/lib/api/client";
import { formatTime } from "@/lib/utils/dates";

/**
 * The member's highest-frequency task: a server-signed, short-lived entry pass.
 * The QR is requested only while the dialog is open and is never cached, so a
 * closed dialog leaves nothing scannable behind. Expiry is stated in the
 * member's words, and a fresh pass is one tap away once the old one lapses.
 */
export function EntryPassDialog({
  open,
  onOpenChange,
  membershipId,
  memberNumber,
  gymName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  membershipId: string;
  memberNumber: string;
  gymName: string;
}) {
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [expired, setExpired] = useState(false);

  const load = useCallback(async () => {
    setToken("");
    setExpiresAt(undefined);
    setError(undefined);
    setExpired(false);
    setLoading(true);
    try {
      const pass = await getApi().getEntryPass(membershipId);
      setToken(pass.token);
      setExpiresAt(pass.expiresAt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The entry pass could not be prepared.");
    } finally {
      setLoading(false);
    }
  }, [membershipId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  // Flip to the expired state on time so a member never holds a pass the desk
  // will refuse. The check is cheap and stops when the dialog closes.
  useEffect(() => {
    if (!open || !expiresAt) return;
    const check = () => setExpired(Date.parse(expiresAt) <= Date.now());
    check();
    const timer = window.setInterval(check, 15_000);
    return () => window.clearInterval(timer);
  }, [expiresAt, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Entry QR</DialogTitle>
          <p className="mt-1 text-[13px] text-ink-2">{gymName}</p>
        </DialogHeader>
        <DialogBody className="text-center">
          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-[13px] text-ink-3" role="status">
              <span className="h-1 w-32 overflow-hidden rounded-full bg-sunken-2"><span className="block h-full w-1/2 animate-pulse rounded-full bg-ink" /></span>
              Preparing a short-lived entry pass…
            </div>
          ) : error ? (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-4 text-start text-[13px] text-danger">
              <p>{error}</p>
              <Button className="mt-3" size="sm" variant="secondary" onClick={() => void load()}>Try again</Button>
            </div>
          ) : token ? (
            <>
              <div className={expired ? "relative mx-auto w-fit rounded-lg border border-line bg-white p-4 opacity-30" : "mx-auto w-fit rounded-lg border border-line bg-white p-4"} aria-hidden={expired || undefined}>
                <QRCodeSVG value={token} size={232} level="H" bgColor="#ffffff" fgColor="#15140f" aria-label="Membership entry QR code" className="block h-auto w-full max-w-[232px]" />
              </div>
              <p className="mt-4 font-mono text-[18px] tracking-wide text-ink">{memberNumber}</p>
              {expired ? (
                <p className="mt-2 text-[13px] font-medium text-warning-deep" role="status">This pass has expired. Refresh to get a new one.</p>
              ) : (
                <p className="mt-2 text-[13px] text-ink-2" role="status">Expires at {expiresAt ? formatTime(expiresAt) : "the time shown by the desk"}. Show it at reception, then close this window.</p>
              )}
              <Button className="mt-4" size="sm" variant={expired ? "primary" : "secondary"} onClick={() => void load()}>
                <RefreshCcw /> {expired ? "Refresh pass" : "Get a fresh pass"}
              </Button>
            </>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
