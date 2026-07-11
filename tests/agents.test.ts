import { describe, expect, it, vi } from 'vitest';
import { buildSystemPrompt, scoutBundle } from '../src/lib/agents';
import { getMarket } from '../src/lib/market';
import type { NegotiationState } from '../src/lib/types';

function neg(over: Partial<NegotiationState> = {}): NegotiationState {
  const market = getMarket();
  return {
    id: 'n-prompt-test',
    buyerId: market.buyers[0].id,
    sellerId: market.sellers[0].id,
    // A negotiation is with one supplier — bundle from that seller's own stock.
    bundleItemIds: market.itemsOf(market.sellers[0].id).slice(0, 3).map((i) => i.id),
    turn: 'buyer',
    status: 'active',
    round: 0,
    roundCap: 8,
    control: { buyer: 'agent', seller: 'agent' },
    ...over,
  };
}

describe('buildSystemPrompt', () => {
  it('gives Flo an upsell shelf of the seller\'s own items outside the bundle', () => {
    const market = getMarket();
    const n = neg();
    const p = buildSystemPrompt(market, n, 'seller');
    expect(p).toContain('UPSELL');
    expect(p).toContain('upsell shelf');
    const shelfSection = p.split('upsell shelf')[1].split('PRIVATE')[0];
    // shelf must not contain bundle items
    for (const id of n.bundleItemIds) expect(shelfSection).not.toContain(`- ${id}:`);
    // shelf must contain ONLY the negotiation seller's items
    const sellerIds = new Set(market.itemsOf(n.sellerId).map((i) => i.id));
    const shelfIds = [...shelfSection.matchAll(/- (item-\d+):/g)].map((m) => m[1]);
    expect(shelfIds.length).toBeGreaterThan(0);
    for (const id of shelfIds) expect(sellerIds.has(id)).toBe(true);
  });

  it('includes the owner brief and scout notes in Finn prompt when present', () => {
    const p = buildSystemPrompt(
      getMarket(),
      neg({ buyerBrief: 'hunt workwear under £150', scoutNotes: 'picked jackets for velocity' }),
      'buyer'
    );
    expect(p).toContain('hunt workwear under £150');
    expect(p).toContain('picked jackets for velocity');
    expect(p).toContain('accept additions only when they serve the brief');
  });

  it('omits the brief block when no brief was given', () => {
    const p = buildSystemPrompt(getMarket(), neg(), 'buyer');
    expect(p).not.toContain("OWNER'S BRIEF");
  });
});

describe('brief spend ceiling', () => {
  it('effectiveBuyerMax is capped by buyerCap and enforced by validation', async () => {
    const market = getMarket();
    const { validateMove } = await import('../src/lib/negotiation');
    const n = neg({ buyerBrief: 'workwear, £150 max', buyerCap: 150 });
    expect(market.effectiveBuyerMax(n, n.bundleItemIds)).toBeLessThanOrEqual(150);
    const r = validateMove(n, 'buyer', { action: 'offer', price: 151, message: 'm' }, market.validationCtx(n));
    expect(r.ok).toBe(false);
  });

  it('without a cap, effectiveBuyerMax equals the economic max', () => {
    const market = getMarket();
    const n = neg();
    expect(market.effectiveBuyerMax(n, n.bundleItemIds)).toBe(market.buyerMax(n.buyerId, n.bundleItemIds));
  });
});

describe('scoutBundle', () => {
  it('returns the chosen supplier plus validated item ids, filtering hallucinated ones', async () => {
    const market = getMarket();
    const seller = market.sellers[0];
    const real = market.itemsOf(seller.id).slice(0, 3).map((i) => i.id);
    const llm = vi.fn().mockResolvedValue({
      sellerId: seller.id,
      matchQuality: 'good',
      itemIds: [...real, 'item-999-fake'],
      rationale: 'good velocity',
      openingPlan: 'open at 30%',
    });
    const r = await scoutBundle(market, market.buyers[0].id, 'workwear please', llm as never);
    expect(r.sellerId).toBe(seller.id);
    expect(r.itemIds).toEqual(real);
    expect(r.rationale).toBe('good velocity');
  });

  it('filters out items belonging to a supplier other than the one chosen', async () => {
    const market = getMarket();
    const chosen = market.sellers[0];
    const other = market.sellers[1];
    const own = market.itemsOf(chosen.id).slice(0, 2).map((i) => i.id);
    const foreign = market.itemsOf(other.id).slice(0, 2).map((i) => i.id);
    const llm = vi.fn().mockResolvedValue({
      sellerId: chosen.id,
      matchQuality: 'good',
      itemIds: [...own, ...foreign],
      rationale: 'mixed picks',
      openingPlan: 'open low',
    });
    const r = await scoutBundle(market, market.buyers[0].id, 'brief', llm as never);
    expect(r.itemIds).toEqual(own);
    for (const id of foreign) expect(r.itemIds).not.toContain(id);
  });

  it('throws when no valid ids survive', async () => {
    const market = getMarket();
    const llm = vi.fn().mockResolvedValue({
      sellerId: market.sellers[0].id,
      matchQuality: 'none',
      itemIds: ['nope'],
      rationale: 'x',
      openingPlan: 'y',
    });
    await expect(scoutBundle(market, market.buyers[0].id, 'brief', llm as never)).rejects.toThrow();
  });
});
