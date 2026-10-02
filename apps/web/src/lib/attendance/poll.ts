/** A clock-driven refresh is necessary: database subscriptions alone do not fire on time expiry. */
export async function pollAttendance<T>(read: () => Promise<T>, onValue: (value: T) => void, onError?: (error: unknown) => void): Promise<() => void> {
  let stopped = false;
  let pending = false;
  const refresh = async () => {
    if (stopped || pending) return;
    pending = true;
    try { const value = await read(); if (!stopped) onValue(value); } catch (error) { if (!stopped) onError?.(error); }
    finally { pending = false; }
  };
  const timer = setInterval(() => void refresh(), 15_000);
  const resume = () => void refresh();
  if (typeof window !== "undefined") { window.addEventListener("online", resume); window.addEventListener("focus", resume); }
  void refresh();
  return () => { stopped = true; clearInterval(timer); if (typeof window !== "undefined") { window.removeEventListener("online", resume); window.removeEventListener("focus", resume); } };
}
