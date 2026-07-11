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
    bundleItemIds: market.items.slice(0, 3).map((i) => i.id),
    turn: 'buyer',
    status: 'active',
    round: 0,
    roundCap: 8,
    control: { buyer: 'agent', seller: 'agent' },
    ...over,
  };
}

describe('buildSystemPrompt', () => {
  it('gives Flo an upsell shelf of items outside the bundle', () => {
    const p = buildSystemPrompt(getMarket(), neg(), 'seller');
    expect(p).toContain('UPSELL');
    expect(p).toContain('upsell shelf');
    // shelf must not contain bundle items
    const bundleIds = neg().bundleItemIds;
    const shelfSection = p.split('upsell shelf')[1].split('PRIVATE')[0];
    for (const id of bundleIds) expect(shelfSection).not.toContain(`- ${id}:`);
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
  it('returns validated item ids and filters hallucinated ones', async () => {
    const market = getMarket();
    const real = market.items.slice(0, 3).map((i) => i.id);
    const llm = vi.fn().mockResolvedValue({
      itemIds: [...real, 'item-999-fake'],
      rationale: 'good velocity',
      openingPlan: 'open at 30%',
    });
    const r = await scoutBundle(market, market.buyers[0].id, 'workwear please', llm as never);
    expect(r.itemIds).toEqual(real);
    expect(r.rationale).toBe('good velocity');
  });

  it('throws when no valid ids survive', async () => {
    const market = getMarket();
    const llm = vi.fn().mockResolvedValue({ itemIds: ['nope'], rationale: 'x', openingPlan: 'y' });
    await expect(scoutBundle(market, market.buyers[0].id, 'brief', llm as never)).rejects.toThrow();
  });
});
