import { describe, expect, it } from 'vitest';
import { bundleOracle, deriveDealSummary } from '../src/lib/summary';
import type { MarketEvent, OraclePrice } from '../src/lib/types';

const ORACLE: Record<string, OraclePrice> = Object.fromEntries(
  [
    ['a', 30],
    ['b', 30],
    ['c', 40],
    ['d', 50],
    ['e', 50],
  ].map(([id, estimate]) => [
    id,
    { itemId: id as string, estimate: estimate as number, low: 0, high: 0, evidence: [] },
  ])
);

let seq = 0;
function ev(type: string, payload: Record<string, unknown>, visibility = 'public'): MarketEvent {
  return {
    seq: ++seq,
    ts: seq,
    negotiationId: 'n1',
    visibility: visibility as MarketEvent['visibility'],
    type,
    payload,
  };
}

function baseEvents(): MarketEvent[] {
  seq = 0;
  return [
    ev('negotiation_created', {
      itemIds: ['a', 'b', 'c'],
      oracleValue: 100,
      buyerShop: 'Shop',
      sellerWarehouse: 'Warehouse',
    }),
    ev('move', { side: 'buyer', action: 'offer', price: 30, message: 'open' }),
    ev('move', { side: 'seller', action: 'counter', price: 60, message: 'counter' }),
  ];
}

describe('deriveDealSummary', () => {
  it('returns null while the negotiation is not terminal', () => {
    const events = baseEvents();
    expect(deriveDealSummary(events, 'n1', ORACLE)).toBeNull();
    events.push(ev('status', { status: 'pending_approval', agreedPrice: 60, turn: 'buyer' }));
    expect(deriveDealSummary(events, 'n1', ORACLE)).toBeNull();
  });

  it('derives trajectory, upsell oracle shift, approvals, and outcome for a closed deal', () => {
    const events = baseEvents();
    // Upsell: seller adds d+e (oracle 100 -> 200)
    events.push(
      ev('move', {
        side: 'seller',
        action: 'counter',
        price: 90,
        bundleItemIds: ['a', 'b', 'c', 'd', 'e'],
        message: 'take the lot',
      }),
      ev('move', { side: 'buyer', action: 'counter', price: 70, message: 'meet me' }),
      ev('move', { side: 'buyer', action: 'accept', price: 70, message: 'done' }),
      ev('status', { status: 'pending_approval', agreedPrice: 70, turn: 'buyer' }),
      ev('approval_decision', { side: 'seller', approved: true, auto: true, note: 'fine' }),
      ev('approval_decision', { side: 'buyer', approved: true }),
      ev('status', { status: 'deal', agreedPrice: 70, turn: 'buyer' })
    );
    const s = deriveDealSummary(events, 'n1', ORACLE)!;
    expect(s.outcome).toBe('deal');
    expect(s.finalPrice).toBe(70);
    expect(s.mediated).toBe(false);
    expect(s.openingOracle).toBe(100);
    expect(s.finalOracle).toBe(200);
    expect(s.finalItemIds).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(s.rounds).toBe(4); // offer, counter, upsell counter, buyer counter
    expect(s.trajectory.map((t) => t.price)).toEqual([30, 60, 90, 70]);
    expect(s.trajectory[2].bundleChanged).toBe(true);
    expect(s.trajectory[2].bundleSize).toBe(5);
    // The accepted offer becomes the settle point — no duplicate dot at the same price.
    expect(s.trajectory[3].kind).toBe('accept');
    expect(s.changes).toHaveLength(1);
    expect(s.changes[0]).toMatchObject({
      fromCount: 3,
      toCount: 5,
      fromOracle: 100,
      toOracle: 200,
      added: ['d', 'e'],
      dropped: [],
      keptInFinal: true,
    });
    expect(s.finalApprovals).toHaveLength(2);
    expect(s.finalApprovals.every((a) => a.approved)).toBe(true);
    expect(s.sendBacks).toBe(0);
  });

  it('marks an upsell declined when a later restructure removes the added items', () => {
    const events = baseEvents();
    events.push(
      ev('move', {
        side: 'seller',
        action: 'counter',
        price: 90,
        bundleItemIds: ['a', 'b', 'c', 'd', 'e'],
        message: 'upsell',
      }),
      // Buyer restructures back down: drops the upsell items
      ev('move', {
        side: 'buyer',
        action: 'counter',
        price: 55,
        bundleItemIds: ['a', 'b', 'c'],
        message: 'no extras',
      }),
      ev('move', { side: 'seller', action: 'accept', price: 55, message: 'ok' }),
      ev('status', { status: 'pending_approval', agreedPrice: 55, turn: 'seller' }),
      ev('approval_decision', { side: 'seller', approved: true, auto: true }),
      ev('approval_decision', { side: 'buyer', approved: true }),
      ev('status', { status: 'deal', agreedPrice: 55, turn: 'seller' })
    );
    const s = deriveDealSummary(events, 'n1', ORACLE)!;
    expect(s.changes).toHaveLength(2);
    expect(s.changes[0].keptInFinal).toBe(false); // upsell reverted
    expect(s.changes[1].keptInFinal).toBe(true); // the drop stood
    expect(s.finalOracle).toBe(100);
    expect(s.finalItemIds).toEqual(['a', 'b', 'c']);
  });

  it('handles a mediated deal with a mediation trajectory point', () => {
    const events = baseEvents();
    events.push(
      ev('move', { side: 'buyer', action: 'invoke_mediator', message: 'mediate?' }),
      ev('move', { side: 'seller', action: 'invoke_mediator', message: 'agreed' }),
      ev('status', { status: 'mediation', turn: 'buyer' }),
      ev('mediation_result', { deal: true, price: 45 }),
      ev('status', { status: 'pending_approval', agreedPrice: 45, turn: 'buyer' }),
      ev('approval_decision', { side: 'seller', approved: true, auto: true }),
      ev('approval_decision', { side: 'buyer', approved: true }),
      ev('status', { status: 'mediated_deal', agreedPrice: 45, turn: 'buyer' })
    );
    const s = deriveDealSummary(events, 'n1', ORACLE)!;
    expect(s.outcome).toBe('mediated_deal');
    expect(s.mediated).toBe(true);
    expect(s.finalPrice).toBe(45);
    expect(s.trajectory[s.trajectory.length - 1]).toMatchObject({ kind: 'mediation', price: 45 });
  });

  it('handles a walk-away with no approvals and counts send-backs', () => {
    const events = baseEvents();
    events.push(
      ev('move', { side: 'buyer', action: 'accept', price: 60, message: 'ok' }),
      ev('status', { status: 'pending_approval', agreedPrice: 60, turn: 'buyer' }),
      ev('approval_decision', { side: 'buyer', approved: false, note: 'too dear' }),
      ev('status', { status: 'active', turn: 'buyer' }),
      ev('move', { side: 'buyer', action: 'walk_away', message: 'leaving' }),
      ev('status', { status: 'walked_away', turn: 'seller' })
    );
    const s = deriveDealSummary(events, 'n1', ORACLE)!;
    expect(s.outcome).toBe('walked_away');
    expect(s.finalPrice).toBeUndefined();
    expect(s.sendBacks).toBe(1);
    expect(s.finalApprovals).toEqual([{ side: 'buyer', approved: false, note: 'too dear' }]);
  });

  it('ignores other negotiations and private events', () => {
    const events = baseEvents();
    events.push(
      { ...ev('move', { side: 'buyer', action: 'offer', price: 10, message: 'x' }), negotiationId: 'n2' },
      ev('reasoning', { side: 'buyer', text: 'secret' }, 'buyer_private'),
      ev('move', { side: 'buyer', action: 'accept', price: 60, message: 'ok' }),
      ev('status', { status: 'pending_approval', agreedPrice: 60, turn: 'buyer' }),
      ev('approval_decision', { side: 'seller', approved: true, auto: true }),
      ev('approval_decision', { side: 'buyer', approved: true }),
      ev('status', { status: 'deal', agreedPrice: 60, turn: 'buyer' })
    );
    const s = deriveDealSummary(events, 'n1', ORACLE)!;
    expect(s.trajectory.map((t) => t.price)).toEqual([30, 60]);
    expect(s.trajectory[1].kind).toBe('accept');
  });
});

describe('bundleOracle', () => {
  it('mirrors Market.bundleValue: rounded sum, unknown ids contribute zero', () => {
    expect(bundleOracle(['a', 'b', 'zzz'], ORACLE)).toBe(60);
  });
});
