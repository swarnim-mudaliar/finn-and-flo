import { beforeEach, describe, expect, it } from 'vitest';
import { EventLog, getEventLog } from '../src/lib/eventlog';
import { getMarket } from '../src/lib/market';
import { approveDeal, runNegotiation } from '../src/lib/runner';
import type { NegotiationState } from '../src/lib/types';

// Fake LLM: buyer opens low then accepts; seller counters once.
// Seller ask (£80) sits above the seller floor (~£66) and below the buyer max
// (~£118), so the close is legal under both reservation bounds.
function fakeLlm() {
  let call = 0;
  return async (opts: { system: string }) => {
    call++;
    const isSeller = opts.system.startsWith('You are Flo');
    if (isSeller) {
      return { action: 'counter', price: 80, message: 'Can do £80.', privateReasoning: 'anchor high' };
    }
    return call === 1
      ? { action: 'offer', price: 40, message: 'Opening at £40.', privateReasoning: 'open low' }
      : { action: 'accept', message: 'Deal at £80.', privateReasoning: 'within max' };
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
    // Widen the slice so the fake accept price is within buyer max, and keep all
    // items with the negotiation's seller (a negotiation is single-supplier).
    const itemIds = market.itemsOf(seller.id).slice(0, 5).map((i) => i.id);
    const neg: NegotiationState = {
      id: 'n-test', buyerId: buyer.id, sellerId: seller.id, bundleItemIds: itemIds,
      turn: 'buyer', status: 'active', round: 0, roundCap: 8,
      control: { buyer: 'agent', seller: 'agent' },
    };
    expect(market.buyerMax(buyer.id, itemIds)).toBeGreaterThanOrEqual(60);
    market.negotiations.set(neg.id, neg);

    await runNegotiation('n-test', { llm: fakeLlm() as never });

    // Agents shook hands — but that's provisional until BOTH owners approve.
    const shook = market.negotiations.get('n-test')!;
    expect(shook.status).toBe('pending_approval');
    expect(shook.agreedPrice).toBe(80);

    const events = getEventLog().byNegotiation('n-test');
    const moves = events.filter((e) => e.type === 'move');
    expect(moves.length).toBe(3); // offer, counter, accept
    expect(moves.every((e) => e.visibility === 'public')).toBe(true);
    const reasoning = events.filter((e) => e.type === 'reasoning');
    expect(reasoning.some((e) => e.visibility === 'buyer_private')).toBe(true);
    expect(reasoning.some((e) => e.visibility === 'seller_private')).toBe(true);

    // One approval is not enough…
    expect(approveDeal('n-test', 'buyer', true).ok).toBe(true);
    expect(market.negotiations.get('n-test')!.status).toBe('pending_approval');
    // …both close the deal.
    expect(approveDeal('n-test', 'seller', true).ok).toBe(true);
    expect(market.negotiations.get('n-test')!.status).toBe('deal');
    const decisions = getEventLog().byNegotiation('n-test').filter((e) => e.type === 'approval_decision');
    expect(decisions).toHaveLength(2);
  });

  it('owner rejection reopens the negotiation with the rejecting side to move', async () => {
    const market = getMarket();
    const neg: NegotiationState = {
      id: 'n-reject', buyerId: market.buyers[0].id, sellerId: market.sellers[0].id,
      bundleItemIds: market.itemsOf(market.sellers[0].id).slice(0, 3).map((i) => i.id),
      turn: 'seller', status: 'pending_approval', agreedPrice: 70, round: 4, roundCap: 8,
      control: { buyer: 'human', seller: 'human' }, // humans hold both sides so no LLM runs
      approvals: {},
    };
    market.negotiations.set(neg.id, neg);
    expect(approveDeal('n-reject', 'buyer', false, 'too rich, push for £60').ok).toBe(true);
    const reopened = market.negotiations.get('n-reject')!;
    expect(reopened.status).toBe('active');
    expect(reopened.turn).toBe('buyer');
    expect(reopened.agreedPrice).toBeUndefined();
    expect(reopened.roundCap).toBe(10); // grace rounds
  });
});
