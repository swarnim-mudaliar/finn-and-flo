import { config } from 'dotenv';
config({ path: '.env.local' });
import fs from 'node:fs';
import path from 'node:path';
import { callWithTool } from '../src/lib/llm';
import type { BuyerProfile, Comp, Item, RelationshipRecord, SellerProfile } from '../src/lib/types';

// ADDITIVE expansion. This reads the existing data files and APPENDS new records —
// never mutating or removing item-001..item-050, seller-001/002, buyer-001/002, their
// relationships, comps, or the oracle cache. Re-runnable: each section is skipped if its
// records already exist. Mirrors scripts/generate-data.ts's callWithTool style.

const dataDir = path.join(process.cwd(), 'data');

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')) as T;
}
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

// seller-003 — Manchester deadstock/sportswear specialist (fast, cheap, volume).
const SELLER3_ARCHETYPES = [
  'nike-vintage-hoodie', 'adidas-track-jacket', 'vintage-football-shirt', 'y2k-graphic-tee',
  'band-tee', 'football-shirt-y2k', 'nike-windbreaker', 'adidas-samba-trainers',
];
// seller-004 — Istanbul denim & leather house (mid-premium, patient).
const SELLER4_ARCHETYPES = [
  'levis-501', 'levis-trucker-jacket', 'dr-martens-boots', 'leather-jacket',
  'vintage-levis-silver-tab', 'suede-jacket',
];
// Archetypes that do NOT yet exist in comps.json — each needs 6 sold comps.
const NEW_ARCHETYPES = [
  'football-shirt-y2k', 'nike-windbreaker', 'adidas-samba-trainers',
  'leather-jacket', 'vintage-levis-silver-tab', 'suede-jacket',
];

const ITEM_SCHEMA = (archetypes: string[]) => ({
  type: 'object',
  properties: {
    title: { type: 'string' }, brand: { type: 'string' },
    category: { type: 'string' }, era: { type: 'string' },
    conditionGrade: { type: 'string', enum: ['A', 'B', 'C'] },
    defects: { type: 'array', items: { type: 'string' } },
    archetype: { type: 'string', enum: archetypes },
  },
  required: ['title', 'brand', 'category', 'era', 'conditionGrade', 'defects', 'archetype'],
});

type RawItem = Omit<Item, 'id' | 'sellerId'>;

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing — put it in .env.local');

  // ---- Items: item-051..item-130 across seller-003 and seller-004 ----
  const inventory = readJson<Item[]>('inventory.json');
  if (!inventory.some((i) => i.id === 'item-051')) {
    const s3raw = (await gen(
      'seller-003 items',
      `Generate 40 secondhand items for a Manchester deadstock/sportswear specialist warehouse
(fast, cheap, high volume — Nike/Adidas trainers & trackwear, vintage football shirts, Y2K
sportswear and band/graphic tees). Each item's "archetype" MUST be exactly one of:
${SELLER3_ARCHETYPES.join(', ')}. Spread across all of them. Mix condition grades A/B/C;
grade B/C items get 1-3 realistic defects (bobbling, cracked prints, small stains, loose stitching,
scuffed soles). Do NOT include an id or sellerId — those are assigned later.`,
      ITEM_SCHEMA(SELLER3_ARCHETYPES)
    )) as RawItem[];

    const s4raw = (await gen(
      'seller-004 items',
      `Generate 40 secondhand items for an Istanbul denim & leather house (mid-premium, patient
negotiator — Levi's 501s and Silver Tab, trucker jackets, leather and suede jackets, Dr Martens
boots). Each item's "archetype" MUST be exactly one of: ${SELLER4_ARCHETYPES.join(', ')}. Spread
across all of them. Mix condition grades A/B/C; grade B/C items get 1-3 realistic defects (fading,
patina, cracked leather, worn heels, repaired seams, missing rivets). Do NOT include an id or
sellerId — those are assigned later.`,
      ITEM_SCHEMA(SELLER4_ARCHETYPES)
    )) as RawItem[];

    const clean = (r: RawItem, sellerId: string, id: string): Item => ({
      id, sellerId, title: r.title, brand: r.brand, category: r.category, era: r.era,
      conditionGrade: r.conditionGrade, defects: Array.isArray(r.defects) ? r.defects : [],
      archetype: r.archetype,
    });

    let n = 51;
    const newItems: Item[] = [];
    for (const r of s3raw) newItems.push(clean(r, 'seller-003', `item-${String(n++).padStart(3, '0')}`));
    for (const r of s4raw) newItems.push(clean(r, 'seller-004', `item-${String(n++).padStart(3, '0')}`));
    write('inventory.json', [...inventory, ...newItems]);
    console.log(`appended ${newItems.length} items (now ${inventory.length + newItems.length} total)`);
  } else {
    console.log('items already expanded — skipping inventory');
  }

  // ---- Sellers: seller-003, seller-004 ----
  const sellers = readJson<SellerProfile[]>('sellers.json');
  if (!sellers.some((s) => s.id === 'seller-003')) {
    const newSellers = (await gen(
      'sellers',
      `Generate 2 wholesale supplier profiles for the same UK-facing marketplace.
ids: seller-003 (a Manchester deadstock/sportswear specialist — Nike/Adidas trainers &
trackwear, vintage football shirts, Y2K sportswear; fast and cheap, a high-volume seller who
prices to move and rewards bulk orders), seller-004 (an Istanbul denim & leather house — Levi's,
trucker jackets, leather/suede outerwear, Dr Martens; mid-premium, a patient negotiator proud of
provenance who holds firm on archive denim but flexes on volume). sellingNotes distills their
selling patterns (typical discounts, which categories they clear cheap, how they treat repeat
buyers). persona is 2 sentences of voice/character.`,
      {
        type: 'object',
        properties: {
          id: { type: 'string', enum: ['seller-003', 'seller-004'] }, warehouseName: { type: 'string' },
          persona: { type: 'string' }, sellingNotes: { type: 'string' },
        },
        required: ['id', 'warehouseName', 'persona', 'sellingNotes'],
      }
    )) as SellerProfile[];
    write('sellers.json', [...sellers, ...newSellers]);
  } else {
    console.log('sellers already expanded — skipping');
  }

  // ---- Buyer: buyer-003 ----
  const buyers = readJson<BuyerProfile[]>('buyers.json');
  if (!buyers.some((b) => b.id === 'buyer-003')) {
    const newBuyers = (await gen(
      'buyers',
      `Generate 1 UK vintage reseller buyer profile. id: buyer-003.
A London menswear vintage store with a mid budget (~£600) needing 50% margin, whose demand skews
to denim, leather, outdoor/workwear and boots — clean grades preferred, curated over cheap.
categoryDemand maps category names to weekly units sold (numbers). salesNotes distills the past 6
months of sales history: what flies, what sits, price bands. persona is 2 sentences of voice.
Set budget to 600 and targetMarginPct to 50.`,
      {
        type: 'object',
        properties: {
          id: { type: 'string', enum: ['buyer-003'] }, shopName: { type: 'string' }, persona: { type: 'string' },
          categoryDemand: { type: 'object' }, salesNotes: { type: 'string' },
          budget: { type: 'number' }, targetMarginPct: { type: 'number' },
        },
        required: ['id', 'shopName', 'persona', 'categoryDemand', 'salesNotes', 'budget', 'targetMarginPct'],
      }
    )) as BuyerProfile[];
    write('buyers.json', [...buyers, ...newBuyers]);
  } else {
    console.log('buyers already expanded — skipping');
  }

  // ---- Relationships: fill every missing buyer/seller pair (all 3×4 must exist) ----
  const relationships = readJson<RelationshipRecord[]>('relationships.json');
  const allBuyers = ['buyer-001', 'buyer-002', 'buyer-003'];
  const allSellers = ['seller-001', 'seller-002', 'seller-003', 'seller-004'];
  const missing: Array<{ buyerId: string; sellerId: string }> = [];
  for (const buyerId of allBuyers) {
    for (const sellerId of allSellers) {
      if (!relationships.some((r) => r.buyerId === buyerId && r.sellerId === sellerId)) {
        missing.push({ buyerId, sellerId });
      }
    }
  }
  if (missing.length > 0) {
    const newRels = (await gen(
      'relationships',
      `Generate relationship records for exactly these buyer/seller pairs (one record each, in
this order): ${JSON.stringify(missing)}.
pastDeals is 0-9. notes covers concession patterns observed in past deals, payment reliability,
repeat-buyer status — e.g. "always opens 40% under ask, closes within 6 rounds, pays same day".
buyer-003 is a London menswear vintage store (denim/leather/outdoor). Make buyer-003 x seller-004
a warm repeat relationship (5+ deals), buyer-003 x seller-003 a couple of deals, and any brand-new
pairing 0-2 deals. Return ONLY records for the pairs listed, with the exact buyerId/sellerId given.`,
      {
        type: 'object',
        properties: {
          buyerId: { type: 'string', enum: allBuyers }, sellerId: { type: 'string', enum: allSellers },
          pastDeals: { type: 'number' }, notes: { type: 'string' },
        },
        required: ['buyerId', 'sellerId', 'pastDeals', 'notes'],
      }
    )) as RelationshipRecord[];
    // Keep only records for genuinely-missing pairs, and guarantee the pair coords are exact.
    const wanted = new Set(missing.map((m) => `${m.buyerId}|${m.sellerId}`));
    const filtered = newRels.filter((r) => wanted.has(`${r.buyerId}|${r.sellerId}`));
    const covered = new Set(filtered.map((r) => `${r.buyerId}|${r.sellerId}`));
    // Backfill any pair the model skipped, so ALL pairs end up present.
    for (const m of missing) {
      if (!covered.has(`${m.buyerId}|${m.sellerId}`)) {
        filtered.push({ buyerId: m.buyerId, sellerId: m.sellerId, pastDeals: 0, notes: 'First contact — no prior dealings on record.' });
      }
    }
    write('relationships.json', [...relationships, ...filtered]);
    console.log(`appended ${filtered.length} relationship records (now ${relationships.length + filtered.length}, expected 12)`);
  } else {
    console.log('all buyer/seller relationship pairs already present — skipping');
  }

  // ---- Comps: 6 per NEW archetype ----
  const comps = readJson<Comp[]>('comps.json');
  const existingArch = new Set(comps.map((c) => c.archetype));
  const needComps = NEW_ARCHETYPES.filter((a) => !existingArch.has(a));
  if (needComps.length > 0) {
    const newComps = (await gen(
      'comps',
      `Generate sold-listing comps for these archetypes: ${needComps.join(', ')}.
EXACTLY 6 comps per archetype. Realistic UK resale sold prices (eBay/Vinted/Depop levels), sold
dates within the last 90 days (today is 2026-07-11), varied conditions, source one of "ebay-sold",
"vinted", "depop". Note: 'football-shirt-y2k' = late-90s/2000s replica football shirts;
'vintage-levis-silver-tab' = 90s/2000s Levi's Silver Tab denim; 'adidas-samba-trainers' = Adidas
Samba/Gazelle trainers; 'leather-jacket' and 'suede-jacket' = vintage leather/suede outerwear;
'nike-windbreaker' = 90s/Y2K Nike shell/windbreaker jackets.`,
      {
        type: 'object',
        properties: {
          archetype: { type: 'string', enum: needComps }, title: { type: 'string' },
          soldPrice: { type: 'number' }, soldDate: { type: 'string' },
          condition: { type: 'string' }, source: { type: 'string' },
        },
        required: ['archetype', 'title', 'soldPrice', 'soldDate', 'condition', 'source'],
      }
    )) as Comp[];
    // Keep only comps for archetypes we actually need (guard against stray outputs).
    const keep = newComps.filter((c) => needComps.includes(c.archetype));
    write('comps.json', [...comps, ...keep]);
    const per = keep.reduce<Record<string, number>>((a, c) => ((a[c.archetype] = (a[c.archetype] ?? 0) + 1), a), {});
    console.log(`appended ${keep.length} comps: ${JSON.stringify(per)}`);
  } else {
    console.log('comps for new archetypes already present — skipping');
  }

  console.log('expansion complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
