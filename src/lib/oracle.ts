import fs from 'node:fs';
import path from 'node:path';
import { callWithTool } from './llm';
import type { Comp, Item, OraclePrice } from './types';

const APPRAISE_SCHEMA = {
  type: 'object',
  properties: {
    estimate: { type: 'number', description: 'Most likely UK resale price in GBP' },
    low: { type: 'number', description: 'Low end of the plausible range' },
    high: { type: 'number', description: 'High end of the plausible range' },
    evidence: { type: 'array', items: { type: 'string' }, description: 'Cited comps and reasoning, one line each' },
  },
  required: ['estimate', 'low', 'high', 'evidence'],
};

export async function priceItem(
  item: Item,
  comps: Comp[],
  llm: typeof callWithTool = callWithTool
): Promise<OraclePrice> {
  const relevant = comps.filter((c) => c.archetype === item.archetype);
  const out = await llm({
    tier: 'sonnet',
    system:
      'You are a secondhand fashion price appraiser. Estimate realistic UK resale prices from sold comps. Cite the comps you rely on. Condition matters: grade B/C and defects discount the price.',
    messages: [
      {
        role: 'user',
        content: `Appraise this item:\n${JSON.stringify(item, null, 2)}\n\nSold comps for this archetype:\n${JSON.stringify(relevant, null, 2)}`,
      },
    ],
    toolName: 'appraise',
    toolDescription: 'Return the price appraisal',
    inputSchema: APPRAISE_SCHEMA,
  });
  const r = out as { estimate: number; low: number; high: number; evidence: string[] };
  return { itemId: item.id, estimate: r.estimate, low: r.low, high: r.high, evidence: r.evidence };
}

export async function priceInventory(
  items: Item[],
  comps: Comp[],
  cachePath: string,
  llm: typeof callWithTool = callWithTool
): Promise<Record<string, OraclePrice>> {
  const cache: Record<string, OraclePrice> = fs.existsSync(cachePath)
    ? JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    : {};
  for (const item of items) {
    if (cache[item.id]) continue;
    cache[item.id] = await priceItem(item, comps, llm);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2)); // write after EACH item — crash-safe
    console.log(`priced ${item.id}: £${cache[item.id].estimate}`);
  }
  return cache;
}
