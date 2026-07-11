'use client';
import { useEffect, useRef, useState } from 'react';
import type { MarketEvent } from '@/lib/types';

export function useEvents(): MarketEvent[] {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const lastSeq = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    // Reconnect ourselves (rather than relying on the browser's native auto-reconnect,
    // which reuses the mount-time since=0 URL and re-backfills the ENTIRE log on every
    // drop) so a dropped SSE resumes from lastSeq.current — only the delta is re-sent.
    function connect(): void {
      if (stopped) return;
      es = new EventSource(`/api/stream?since=${lastSeq.current}`);
      es.onmessage = (m) => {
        const e = JSON.parse(m.data) as MarketEvent;
        lastSeq.current = Math.max(lastSeq.current, e.seq);
        setEvents((prev) => (prev.some((p) => p.seq === e.seq) ? prev : [...prev, e]));
      };
      es.onerror = () => {
        es?.close();
        if (!stopped) retry = setTimeout(connect, 1000);
      };
    }
    connect();

    return () => {
      stopped = true;
      es?.close();
      clearTimeout(retry);
    };
  }, []);

  return events;
}
