'use client';
import { useEffect, useRef, useState } from 'react';
import type { MarketEvent } from '@/lib/types';

export function useEvents(): MarketEvent[] {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const lastSeq = useRef(0);

  useEffect(() => {
    const es = new EventSource(`/api/stream?since=${lastSeq.current}`);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as MarketEvent;
      lastSeq.current = Math.max(lastSeq.current, e.seq);
      setEvents((prev) => (prev.some((p) => p.seq === e.seq) ? prev : [...prev, e]));
    };
    return () => es.close();
  }, []);

  return events;
}
