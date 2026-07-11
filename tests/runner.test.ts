import { beforeEach, describe, expect, it } from 'vitest';
import { EventLog, getEventLog } from '../src/lib/eventlog';
import { getMarket } from '../src/lib/market';
import { runNegotiation } from '../src/lib/runner';
import type { NegotiationState } from '../src/lib/types';

// Fake LLM: buyer opens low then accepts; seller counters once.
function fakeLlm() {
  let call = 0;
  return async (opts: { system: string }) => {
    call++;
    const isSeller = opts.system.startsWith('You are Flo');
    if (isSeller) {
      return { action: 'counter', price: 60, message: 'Can do £60.', privateReasoning: 'anchor high' };
    }
    return call === 1
      ? { action: 'offer', price: 40, message: 'Opening at £40.', privateReasoning: 'open low' }
      : { action: 'accept', message: 'Deal at £60.', privateReasoning: 'within max' };
  };
}

describe('runNegotiation', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__market = undefined;
    (globalThis as Record<string, unknown>).__eventLog = new EventLog(null); // no disk persistence in tests
  });

  it('runs agent turns to a deal and emits visibility-tagged events', async () => {
    const market = getMarket();
    const buyer = market.buyers[0];
    const seller = market.sellers[0];
    // Widen the slice so the fake accept price (£60) is within buyer max
    // (first 3 items give a max of £49; first 5 give £118).
    const itemIds = market.items.slice(0, 5).map((i) => i.id);
    const neg: NegotiationState = {
      id: 'n-test', buyerId: buyer.id, sellerId: seller.id, bundleItemIds: itemIds,
      turn: 'buyer', status: 'active', round: 0, roundCap: 8,
      control: { buyer: 'agent', seller: 'agent' },
    };
    expect(market.buyerMax(buyer.id, itemIds)).toBeGreaterThanOrEqual(60);
    market.negotiations.set(neg.id, neg);

    await runNegotiation('n-test', { llm: fakeLlm() as never });

    const done = market.negotiations.get('n-test')!;
    expect(done.status).toBe('deal');
    expect(done.agreedPrice).toBe(60);

    const events = getEventLog().byNegotiation('n-test');
    const moves = events.filter((e) => e.type === 'move');
    expect(moves.length).toBe(3); // offer, counter, accept
    expect(moves.every((e) => e.visibility === 'public')).toBe(true);
    const reasoning = events.filter((e) => e.type === 'reasoning');
    expect(reasoning.some((e) => e.visibility === 'buyer_private')).toBe(true);
    expect(reasoning.some((e) => e.visibility === 'seller_private')).toBe(true);
  });
});
