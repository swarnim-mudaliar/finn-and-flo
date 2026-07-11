import { config } from 'dotenv';
config({ path: '.env.local' });
import fs from 'node:fs';
import path from 'node:path';
import { callWithTool } from '../src/lib/llm';

const ARCHETYPES = [
  'levis-501', 'carhartt-jacket', 'ralph-lauren-oxford', 'y2k-graphic-tee',
  'nike-vintage-hoodie', 'adidas-track-jacket', 'barbour-wax-jacket', 'band-tee',
  'levis-trucker-jacket', 'patagonia-fleece', 'dickies-work-pants', 'burberry-scarf',
  'stone-island-crewneck', 'vintage-football-shirt', 'dr-martens-boots',
];

const dataDir = path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

function write(name: string, value: unknown): void {
  fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value, null, 2));
  console.log(`wrote data/${name}`);
}

async function gen(name: string, prompt: string, itemsSchema: Record<string, unknown>): Promise<unknown[]> {
  const out = await callWithTool({
    tier: 'sonnet',
    system:
      'You generate realistic synthetic data for a UK-based wholesale secondhand fashion marketplace (like Fleek). Prices in GBP. Output via the tool only.',
    messages: [{ role: 'user', content: prompt }],
    toolName: 'emit',
    toolDescription: 'Emit the generated records',
    inputSchema: { type: 'object', properties: { records: { type: 'array', items: itemsSchema } }, required: ['records'] },
    maxTokens: 16000,
  });
  const records = (out as { records: unknown[] }).records;
  console.log(`${name}: ${records.length} records`);
  return records;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing — put it in .env.local');

  const inventory = await gen(
    'inventory',
    `Generate 50 secondhand clothing items for a Dubai/Karachi rag-house's UK-facing catalog.
Spread across ALL of these archetypes (each item's "archetype" MUST be exactly one of): ${ARCHETYPES.join(', ')}.
Mix of condition grades A/B/C; grade B/C items get 1-3 realistic defects (stains, missing buttons, pilling, repaired seams). ids: item-001..item-050.`,
    {
      type: 'object',
      properties: {
        id: { type: 'string' }, title: { type: 'string' }, brand: { type: 'string' },
        category: { type: 'string' }, era: { type: 'string' },
        conditionGrade: { type: 'string', enum: ['A', 'B', 'C'] },
        defects: { type: 'array', items: { type: 'string' } },
        archetype: { type: 'string', enum: ARCHETYPES },
      },
      required: ['id', 'title', 'brand', 'category', 'era', 'conditionGrade', 'defects', 'archetype'],
    }
  );
  write('inventory.json', inventory);

  const comps = await gen(
    'comps',
    `Generate sold-listing comps for these archetypes: ${ARCHETYPES.join(', ')}.
6 comps per archetype. Realistic UK resale sold prices (eBay/Vinted/Depop levels), sold dates within the last 90 days (today is 2026-07-11), varied conditions, source one of "ebay-sold", "vinted", "depop".`,
    {
      type: 'object',
      properties: {
        archetype: { type: 'string', enum: ARCHETYPES }, title: { type: 'string' },
        soldPrice: { type: 'number' }, soldDate: { type: 'string' },
        condition: { type: 'string' }, source: { type: 'string' },
      },
      required: ['archetype', 'title', 'soldPrice', 'soldDate', 'condition', 'source'],
    }
  );
  write('comps.json', comps);

  const buyers = await gen(
    'buyers',
    `Generate 2 UK vintage reseller buyer profiles. ids: buyer-001, buyer-002.
One is a Manchester Depop seller focused on Y2K/streetwear with fast sell-through and tight budget (~£400, needs 55% margin);
one is a Brighton vintage shop focused on workwear/outdoor brands (~£800 budget, needs 45% margin).
categoryDemand maps category names to weekly units sold (numbers). salesNotes distills their past 6 months of sales history: what flies, what sits, price bands. persona is 2 sentences of voice/character.`,
    {
      type: 'object',
      properties: {
        id: { type: 'string' }, shopName: { type: 'string' }, persona: { type: 'string' },
        categoryDemand: { type: 'object' }, salesNotes: { type: 'string' },
        budget: { type: 'number' }, targetMarginPct: { type: 'number' },
      },
      required: ['id', 'shopName', 'persona', 'categoryDemand', 'salesNotes', 'budget', 'targetMarginPct'],
    }
  );
  write('buyers.json', buyers);

  const sellers = await gen(
    'sellers',
    `Generate 2 wholesale supplier profiles for the same marketplace. ids: seller-001 (large Karachi rag-house, high volume, moves stock fast, hates stale inventory), seller-002 (Dubai boutique wholesaler, premium grading, patient). sellingNotes distills their past selling patterns (typical discounts given, which categories they clear cheap, how they treat repeat buyers). persona is 2 sentences of voice.`,
    {
      type: 'object',
      properties: {
        id: { type: 'string' }, warehouseName: { type: 'string' },
        persona: { type: 'string' }, sellingNotes: { type: 'string' },
      },
      required: ['id', 'warehouseName', 'persona', 'sellingNotes'],
    }
  );
  write('sellers.json', sellers);

  const relationships = await gen(
    'relationships',
    `Generate relationship records for every buyer/seller pair among buyers buyer-001, buyer-002 and sellers seller-001, seller-002 (4 records).
pastDeals is 0-9. notes covers concession patterns observed in past deals, payment reliability, repeat-buyer status — e.g. "always opens 40% under ask, closes within 6 rounds, pays same day". Make buyer-001 x seller-001 a strong repeat relationship (7+ deals) and buyer-002 x seller-002 first-contact (0 deals).`,
    {
      type: 'object',
      properties: {
        buyerId: { type: 'string' }, sellerId: { type: 'string' },
        pastDeals: { type: 'number' }, notes: { type: 'string' },
      },
      required: ['buyerId', 'sellerId', 'pastDeals', 'notes'],
    }
  );
  write('relationships.json', relationships);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
