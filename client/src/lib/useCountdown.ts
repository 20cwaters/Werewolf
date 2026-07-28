import { useEffect, useState } from 'react';

/**
 * Seconds remaining until `endsAt` (an epoch-ms timestamp from the server).
 * Driving every timer off a server timestamp rather than a local tick count
 * keeps all clients in agreement even after a tab is backgrounded.
 */
export function useCountdown(endsAt: number | null | undefined): {
  seconds: number;
  total: number;
  fraction: number;
} {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    // A backgrounded tab throttles intervals; resync the moment it returns.
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [endsAt]);

  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (endsAt) setTotal(Math.max(1, endsAt - Date.now()));
  }, [endsAt]);

  if (!endsAt) return { seconds: 0, total: 0, fraction: 0 };
  const remaining = Math.max(0, endsAt - now);
  return {
    seconds: Math.ceil(remaining / 1000),
    total: Math.round(total / 1000),
    fraction: total > 0 ? Math.min(1, remaining / total) : 0,
  };
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
