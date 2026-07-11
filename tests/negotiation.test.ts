import { describe, expect, it } from 'vitest';
import { applyMove, validateMove, type ValidationCtx } from '../src/lib/negotiation';
import type { MoveInput, NegotiationState } from '../src/lib/types';

function state(over: Partial<NegotiationState> = {}): NegotiationState {
  return {
    id: 'n1',
    buyerId: 'b1',
    sellerId: 's1',
    bundleItemIds: ['i1', 'i2'],
    turn: 'buyer',
    status: 'active',
    round: 0,
    roundCap: 8,
    control: { buyer: 'agent', seller: 'agent' },
    ...over,
  };
}

const ctx: ValidationCtx = {
  bundleOracleValue: (ids) => ids.length * 50, // £50/item
  buyerMax: () => 60,
  sellerFloor: () => 30,
  inventoryIds: new Set(['i1', 'i2', 'i3']),
};

const offer = (price: number, over: Partial<MoveInput> = {}): MoveInput => ({
  action: 'offer',
  price,
  message: 'm',
  ...over,
});

describe('validateMove — hard invariants reject', () => {
  it('rejects out-of-turn moves', () => {
    const r = validateMove(state(), 'seller', offer(50), ctx);
    expect(r.ok).toBe(false);
  });
  it('rejects moves on non-active negotiations', () => {
    const r = validateMove(state({ status: 'deal' }), 'buyer', offer(50), ctx);
    expect(r.ok).toBe(false);
  });
  it('rejects non-positive and missing prices on offers', () => {
    expect(validateMove(state(), 'buyer', offer(0), ctx).ok).toBe(false);
    expect(validateMove(state(), 'buyer', { action: 'offer', message: 'm' }, ctx).ok).toBe(false);
  });
  it('rejects prices outside sane multiple of oracle value', () => {
    expect(validateMove(state(), 'buyer', offer(5), ctx).ok).toBe(false); // < 0.1 * 100
    // buyerMax also caps at 60, so test the 5x ceiling from the seller side
    const s = state({ turn: 'seller' });
    expect(validateMove(s, 'seller', offer(501), ctx).ok).toBe(false); // > 5 * 100
  });
  it('rejects bundle items not in inventory', () => {
    const r = validateMove(state(), 'buyer', offer(50, { bundleItemIds: ['i1', 'nope'] }), ctx);
    expect(r.ok).toBe(false);
  });
  it('rejects empty bundles', () => {
    expect(validateMove(state(), 'buyer', offer(50, { bundleItemIds: [] }), ctx).ok).toBe(false);
  });
  it('ENFORCES buyer max in code: offer above max rejected', () => {
    expect(validateMove(state(), 'buyer', offer(61), ctx).ok).toBe(false);
  });
  it('ENFORCES seller floor in code: ask below floor rejected', () => {
    // bundle value 100, sane range [10, 500]; £20 clears the sane check but is below the £30 floor.
    const s = state({ turn: 'seller' });
    expect(validateMove(s, 'seller', offer(20), ctx).ok).toBe(false);
  });
  it('ENFORCES reservation on accept: buyer cannot accept above max, seller below floor', () => {
    const sBuyer = state({ lastOffer: { side: 'seller', price: 61, bundleItemIds: ['i1', 'i2'] } });
    expect(validateMove(sBuyer, 'buyer', { action: 'accept', message: 'm' }, ctx).ok).toBe(false);
    const sSeller = state({
      turn: 'seller',
      lastOffer: { side: 'buyer', price: 29, bundleItemIds: ['i1', 'i2'] },
    });
    expect(validateMove(sSeller, 'seller', { action: 'accept', message: 'm' }, ctx).ok).toBe(false);
  });
  it('rejects accept when there is nothing to accept', () => {
    expect(validateMove(state(), 'buyer', { action: 'accept', message: 'm' }, ctx).ok).toBe(false);
  });
  it('at round cap: priced moves rejected, accept/walk/mediator allowed', () => {
    const s = state({
      round: 8,
      lastOffer: { side: 'seller', price: 55, bundleItemIds: ['i1', 'i2'] },
    });
    expect(validateMove(s, 'buyer', offer(50), ctx).ok).toBe(false);
    expect(validateMove(s, 'buyer', { action: 'accept', message: 'm' }, ctx).ok).toBe(true);
    expect(validateMove(s, 'buyer', { action: 'invoke_mediator', message: 'm' }, ctx).ok).toBe(true);
  });
});

describe('validateMove — soft signals warn, never reject', () => {
  it('lower price after dropping items is VALID (bundle restructuring)', () => {
    const s = state({
      turn: 'seller',
      lastOffer: { side: 'seller', price: 90, bundleItemIds: ['i1', 'i2'] },
    });
    const r = validateMove(s, 'seller', offer(48, { bundleItemIds: ['i1'], action: 'counter' }), ctx);
    expect(r.ok).toBe(true);
  });
  it('weird concession direction on unchanged bundle is a warning, not a rejection', () => {
    const s = state({ lastOffer: { side: 'buyer', price: 50, bundleItemIds: ['i1', 'i2'] }, turn: 'buyer' });
    const r = validateMove(s, 'buyer', offer(40), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('validateMove — reservation is computed on the PROPOSED bundle, not the pre-restructure one', () => {
  // Floor/max scale with bundle size: 2 items -> floor £50 / max £120, 1 item -> floor £25 / max £60.
  const scaledCtx: ValidationCtx = {
    bundleOracleValue: (ids) => ids.length * 50,
    buyerMax: (ids) => ids.length * 60,
    sellerFloor: (ids) => ids.length * 25,
    inventoryIds: new Set(['i1', 'i2', 'i3']),
  };

  it('seller can drop an item and lower the ask below the OLD bundle floor (the demo beat)', () => {
    // Current bundle ['i1','i2'] floor = £50. Restructure to ['i1'] at £30: £30 < £50 would
    // false-reject if valued on the current bundle, but £30 >= 1-item floor (£25) so it must pass.
    const s = state({
      turn: 'seller',
      bundleItemIds: ['i1', 'i2'],
      lastOffer: { side: 'seller', price: 90, bundleItemIds: ['i1', 'i2'] },
    });
    const r = validateMove(
      s, 'seller', { action: 'counter', price: 30, bundleItemIds: ['i1'], message: 'm' }, scaledCtx
    );
    expect(r.ok).toBe(true);
  });

  it('accept is valued against the offered bundle', () => {
    const s = state({
      turn: 'seller',
      bundleItemIds: ['i1'],
      lastOffer: { side: 'buyer', price: 30, bundleItemIds: ['i1'] },
    });
    expect(validateMove(s, 'seller', { action: 'accept', message: 'm' }, scaledCtx).ok).toBe(true);
  });

  it('buyer offering above the SMALLER bundle max is still rejected', () => {
    const s = state({ turn: 'buyer', bundleItemIds: ['i1', 'i2'] });
    // 1-item max = £60; offering £61 on a proposed 1-item bundle must reject.
    const r = validateMove(
      s, 'buyer', { action: 'offer', price: 61, bundleItemIds: ['i1'], message: 'm' }, scaledCtx
    );
    expect(r.ok).toBe(false);
  });
});

describe('validateMove — reject is capped at the round cap', () => {
  it('rejects a bare reject once the round cap is reached', () => {
    const s = state({ round: 8, lastOffer: { side: 'seller', price: 55, bundleItemIds: ['i1', 'i2'] } });
    expect(validateMove(s, 'buyer', { action: 'reject', message: 'm' }, ctx).ok).toBe(false);
    // closure moves still allowed at the cap
    expect(validateMove(s, 'buyer', { action: 'walk_away', message: 'm' }, ctx).ok).toBe(true);
  });
});

describe('applyMove', () => {
  it('offer updates lastOffer, bundle, round, and flips turn', () => {
    const next = applyMove(state(), 'buyer', offer(50, { bundleItemIds: ['i1'] }));
    expect(next.lastOffer).toEqual({ side: 'buyer', price: 50, bundleItemIds: ['i1'] });
    expect(next.bundleItemIds).toEqual(['i1']);
    expect(next.round).toBe(1);
    expect(next.turn).toBe('seller');
  });
  it('accept closes the deal at lastOffer price', () => {
    const s = state({ lastOffer: { side: 'seller', price: 55, bundleItemIds: ['i1', 'i2'] } });
    const next = applyMove(s, 'buyer', { action: 'accept', message: 'm' });
    expect(next.status).toBe('deal');
    expect(next.agreedPrice).toBe(55);
  });
  it('walk_away and invoke_mediator set terminal/mediation status', () => {
    expect(applyMove(state(), 'buyer', { action: 'walk_away', message: 'm' }).status).toBe('walked_away');
    expect(applyMove(state(), 'buyer', { action: 'invoke_mediator', message: 'm' }).status).toBe('mediation');
  });
  it('reject clears lastOffer and flips turn', () => {
    const s = state({ lastOffer: { side: 'seller', price: 55, bundleItemIds: ['i1', 'i2'] } });
    const next = applyMove(s, 'buyer', { action: 'reject', message: 'm' });
    expect(next.lastOffer).toBeUndefined();
    expect(next.turn).toBe('seller');
  });
});
