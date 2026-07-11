import { describe, expect, it } from 'vitest';
import { EventLog } from '../src/lib/eventlog';

describe('EventLog', () => {
  it('appends with increasing seq and notifies subscribers', () => {
    const log = new EventLog(null);
    const seen: number[] = [];
    log.subscribe((e) => seen.push(e.seq));
    const a = log.append({ negotiationId: 'n1', visibility: 'public', type: 'x', payload: {} });
    const b = log.append({ negotiationId: 'n1', visibility: 'public', type: 'y', payload: {} });
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(seen).toEqual([1, 2]);
  });

  it('since() returns only newer events; byNegotiation filters', () => {
    const log = new EventLog(null);
    log.append({ negotiationId: 'n1', visibility: 'public', type: 'x', payload: {} });
    log.append({ negotiationId: 'n2', visibility: 'public', type: 'y', payload: {} });
    expect(log.since(1)).toHaveLength(1);
    expect(log.byNegotiation('n2')).toHaveLength(1);
  });

  it('unsubscribe stops notifications', () => {
    const log = new EventLog(null);
    let count = 0;
    const unsub = log.subscribe(() => count++);
    log.append({ negotiationId: 'n1', visibility: 'public', type: 'x', payload: {} });
    unsub();
    log.append({ negotiationId: 'n1', visibility: 'public', type: 'x', payload: {} });
    expect(count).toBe(1);
  });

  it('persists to disk and reloads', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ff-')), 'events.jsonl');
    const log = new EventLog(file);
    log.append({ negotiationId: 'n1', visibility: 'public', type: 'x', payload: { a: 1 } });
    const reloaded = new EventLog(file);
    expect(reloaded.since(0)).toHaveLength(1);
    expect(reloaded.append({ negotiationId: 'n1', visibility: 'public', type: 'y', payload: {} }).seq).toBe(2);
  });
});
