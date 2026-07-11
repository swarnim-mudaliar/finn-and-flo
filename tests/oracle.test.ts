import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { priceInventory } from '../src/lib/oracle';
import type { Comp, Item } from '../src/lib/types';

const item = (id: string): Item => ({
  id, title: 'Levis 501', brand: 'Levis', category: 'jeans', era: '90s',
  conditionGrade: 'B', defects: [], archetype: 'levis-501',
});
const comps: Comp[] = [
  { archetype: 'levis-501', title: 'Levis 501 W32', soldPrice: 40, soldDate: '2026-06-01', condition: 'B', source: 'ebay-sold' },
];

describe('priceInventory', () => {
  it('prices via llm and caches to disk; second run makes no llm calls', async () => {
    const cache = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ff-')), 'oracle.json');
    const llm = vi.fn().mockResolvedValue({ estimate: 38, low: 30, high: 45, evidence: ['comp: £40 ebay-sold'] });
    const first = await priceInventory([item('i1')], comps, cache, llm as never);
    expect(first.i1.estimate).toBe(38);
    expect(llm).toHaveBeenCalledTimes(1);
    const second = await priceInventory([item('i1')], comps, cache, llm as never);
    expect(second.i1.estimate).toBe(38);
    expect(llm).toHaveBeenCalledTimes(1); // cache hit — no second call
  });
});
