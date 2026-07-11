import { beforeEach, describe, expect, it, vi } from 'vitest';
import { raceIntel, scoutRace } from '../src/lib/agents';
import { EventLog, getEventLog } from '../src/lib/eventlog';
import { getMarket } from '../src/lib/market';
import { deriveRace, raceReadyToPick } from '../src/lib/race';
import { settleRace } from '../src/lib/runner';
import type { MarketEvent, NegotiationState } from '../src/lib/types';

beforeEach(() => {
  (globalThis as Record<string, unknown>).__market = undefined;
  (globalThis as Record<string, unknown>).__eventLog = new EventLog(null);
});

function raceLane(id: string, sellerIdx: number, over: Partial<NegotiationState> = {}): NegotiationState {
  const market = getMarket();
  const seller = market.sellers[sellerIdx];
  const itemIds = market.itemsOf(seller.id).slice(0, 3).map((i) => i.id);
  const neg: NegotiationState = {
    id,
    buyerId: market.buyers[0].id,
    sellerId: seller.id,
    bundleItemIds: itemIds,
    turn: 'buyer',
    status: 'active',
    round: 2,
    roundCap: 8,
    control: { buyer: 'agent', seller: 'agent' },
    raceId: 'race-t1',
    ...over,
  };
  market.negotiations.set(id, neg);
  return neg;
}

describe('raceIntel', () => {
  it('is empty without a raceId and lists each sibling standing with the truth rule', () => {
    const market = getMarket();
    const a = raceLane('r-a', 0, {
      lastOffer: { side: 'seller', price: 72, bundleItemIds: ['x', 'y'] },
    });
    raceLane('r-b', 1, { status: 'pending_approval', agreedPrice: 55 });
    raceLane('r-c', 2, { status: 'walked_away' });

    const intel = raceIntel(market, a);
    expect(intel).toContain('RACE INTEL');
    expect(intel).toContain('handshake at £55');
    expect(intel).toContain('talks ended');
    expect(intel).toContain('NEVER invent');
    expect(intel).not.toContain(market.sellers[0].warehouseName); // no line about itself

    const solo = raceLane('solo', 0, { raceId: undefined });
    expect(raceIntel(market, solo)).toBe('');
  });
});

describe('settleRace', () => {
  it('approves the winner and walks Finn away from every other live lane', () => {
    const market = getMarket();
    raceLane('w', 0, { status: 'pending_approval', agreedPrice: 60, approvals: { seller: true } });
    raceLane('l1', 1, { status: 'pending_approval', agreedPrice: 90, approvals: { seller: true } });
    raceLane('l2', 2, { status: 'escalated' });

    const res = settleRace('w');
    expect(res.ok).toBe(true);
    expect(market.negotiations.get('w')!.status).toBe('deal');
    expect(market.negotiations.get('l1')!.status).toBe('walked_away');
    expect(market.negotiations.get('l2')!.status).toBe('walked_away');

    const log = getEventLog();
    for (const id of ['l1', 'l2']) {
      const walks = log
        .byNegotiation(id)
        .filter((e) => e.type === 'move' && (e.payload as { action: string }).action === 'walk_away');
      expect(walks, id).toHaveLength(1);
      expect(walks[0].visibility).toBe('public');
    }
    // race_settled is buyer-private and lands on every lane.
    for (const id of ['w', 'l1', 'l2']) {
      const settled = log.byNegotiation(id).filter((e) => e.type === 'race_settled');
      expect(settled, id).toHaveLength(1);
      expect(settled[0].visibility).toBe('buyer_private');
      expect(settled[0].payload).toMatchObject({ winner: 'w' });
    }
  });

  it('refuses a winner that is not a race member awaiting approval', () => {
    raceLane('active-lane', 0); // status: active
    expect(settleRace('active-lane').ok).toBe(false);
    expect(settleRace('missing').ok).toBe(false);
    const market = getMarket();
    market.negotiations.set('no-race', { ...market.negotiations.get('active-lane')!, id: 'no-race', raceId: undefined, status: 'pending_approval' });
    expect(settleRace('no-race').ok).toBe(false);
  });
});

describe('scoutRace', () => {
  it('filters foreign items, dedupes suppliers, and caps at three candidates', async () => {
    const market = getMarket();
    const [s1, s2, s3, s4] = market.sellers.map((s) => s.id);
    const own = (sid: string, n: number) => market.itemsOf(sid).slice(0, n).map((i) => i.id);
    const llm = vi.fn().mockResolvedValue({
      candidates: [
        { sellerId: s1, itemIds: [...own(s1, 3), own(s2, 1)[0]], rationale: 'r1', openingPlan: 'p1' },
        { sellerId: s1, itemIds: own(s1, 2), rationale: 'dupe', openingPlan: 'p' },
        { sellerId: s2, itemIds: own(s2, 3), rationale: 'r2', openingPlan: 'p2' },
        { sellerId: s3, itemIds: ['item-hallucinated'], rationale: 'r3', openingPlan: 'p3' },
        { sellerId: s4, itemIds: own(s4, 2), rationale: 'r4', openingPlan: 'p4' },
      ],
      briefBudgetMax: 150,
      matchQuality: 'good',
    });
    const r = await scoutRace(market, market.buyers[0].id, 'jackets please', llm as never);
    expect(r.candidates).toHaveLength(3);
    expect(new Set(r.candidates.map((c) => c.sellerId)).size).toBe(3);
    expect(r.candidates[0].itemIds).toEqual(own(s1, 3)); // foreign item stripped
    expect(r.candidates.some((c) => c.sellerId === s3)).toBe(false); // all-hallucinated dropped
    expect(r.briefBudgetMax).toBe(150);
  });
});

describe('deriveRace / raceReadyToPick', () => {
  let seq = 0;
  const ev = (negotiationId: string, type: string, payload: Record<string, unknown>, visibility = 'buyer_private'): MarketEvent => ({
    seq: ++seq,
    ts: seq,
    negotiationId,
    visibility: visibility as MarketEvent['visibility'],
    type,
    payload,
  });

  it('derives members across lanes and gates the pick on every lane stopping', () => {
    seq = 0;
    const events: MarketEvent[] = [
      ev('a', 'negotiation_created', { sellerWarehouse: 'Alpha', itemIds: ['x'] }, 'public'),
      ev('b', 'negotiation_created', { sellerWarehouse: 'Beta', itemIds: ['y'] }, 'public'),
      ev('a', 'race_created', { raceId: 'r1', negotiationIds: ['a', 'b'] }),
      ev('b', 'race_created', { raceId: 'r1', negotiationIds: ['a', 'b'] }),
      ev('a', 'move', { side: 'seller', action: 'counter', price: 70, message: 'm' }, 'public'),
      ev('a', 'status', { status: 'pending_approval', agreedPrice: 70 }, 'public'),
    ];
    const view = deriveRace(events, 'a')!;
    expect(view.members.map((m) => m.sellerWarehouse)).toEqual(['Alpha', 'Beta']);
    expect(view.members[0].status).toBe('pending_approval');
    expect(view.members[1].status).toBe('active');
    expect(raceReadyToPick(view)).toBe(false); // Beta still racing

    events.push(ev('b', 'status', { status: 'walked_away' }, 'public'));
    expect(raceReadyToPick(deriveRace(events, 'a')!)).toBe(true);

    events.push(ev('a', 'race_settled', { raceId: 'r1', winner: 'a' }));
    const settled = deriveRace(events, 'a')!;
    expect(settled.settled).toBe(true);
    expect(raceReadyToPick(settled)).toBe(false);

    expect(deriveRace(events, 'not-in-race')).toBeNull();
  });

  it('flags a lane paused on an unanswered ceiling request', () => {
    seq = 0;
    const events: MarketEvent[] = [
      ev('a', 'negotiation_created', { sellerWarehouse: 'Alpha', itemIds: ['x'] }, 'public'),
      ev('a', 'race_created', { raceId: 'r1', negotiationIds: ['a'] }),
      ev('a', 'cap_raise_requested', { currentCap: 100, suggestedCap: 120 }),
    ];
    expect(deriveRace(events, 'a')!.members[0].needsAttention).toBe(true);
    events.push(ev('a', 'cap_decision', { granted: true, newCap: 130 }));
    expect(deriveRace(events, 'a')!.members[0].needsAttention).toBe(false);
  });
});
