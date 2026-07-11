import fs from 'node:fs';
import path from 'node:path';
import type { MarketEvent } from './types';

type Listener = (e: MarketEvent) => void;

export class EventLog {
  private events: MarketEvent[] = [];
  private listeners = new Set<Listener>();
  private seq = 0;

  constructor(private filePath: string | null) {
    if (filePath && fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
      this.events = lines.map((l) => JSON.parse(l) as MarketEvent);
      this.seq = this.events.length ? this.events[this.events.length - 1].seq : 0;
    }
  }

  // `persist: false` keeps an event live-only (subscribers + in-session backfill) without
  // writing it to disk — used for replays so they never permanently pollute events.jsonl
  // and reappear in every future backfill / war-room dropdown.
  append(e: Omit<MarketEvent, 'seq' | 'ts'>, opts: { persist?: boolean } = {}): MarketEvent {
    const event: MarketEvent = { ...e, seq: ++this.seq, ts: Date.now() };
    this.events.push(event);
    if (this.filePath && (opts.persist ?? true)) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, JSON.stringify(event) + '\n');
    }
    for (const l of this.listeners) l(event);
    return event;
  }

  since(seq: number): MarketEvent[] {
    return this.events.filter((e) => e.seq > seq);
  }

  byNegotiation(id: string): MarketEvent[] {
    return this.events.filter((e) => e.negotiationId === id);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

const g = globalThis as unknown as { __eventLog?: EventLog };

export function getEventLog(): EventLog {
  g.__eventLog ??= new EventLog(path.join(process.cwd(), 'data', 'events.jsonl'));
  return g.__eventLog;
}
