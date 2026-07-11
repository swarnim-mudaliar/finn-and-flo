import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventLog } from '../src/lib/eventlog';
import { getMarket } from '../src/lib/market';

function reset(log: EventLog | null): void {
  (globalThis as Record<string, unknown>).__eventLog = log ?? undefined;
  (globalThis as Record<string, unknown>).__market = undefined;
}

afterEach(() => reset(null));

describe('Market rehydration from the persisted event log', () => {
  it('reconstructs live negotiation state after a simulated restart', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ff-')), 'events.jsonl');

    // Run 1: write a negotiation's history to disk.
    const log1 = new EventLog(file);
    const id = 'neg-x';
    log1.append({
      negotiationId: id, visibility: 'public', type: 'negotiation_created',
      payload: { buyerId: 'buyer-001', sellerId: 'seller-001', itemIds: ['item-001', 'item-002'], roundCap: 8 },
    });
    log1.append({
      negotiationId: id, visibility: 'public', type: 'move',
      payload: { side: 'buyer', action: 'offer', price: 40, message: 'open' },
    });
    log1.append({
      negotiationId: id, visibility: 'public', type: 'move',
      payload: { side: 'seller', action: 'counter', price: 80, bundleItemIds: ['item-001'], message: 'drop one' },
    });
    log1.append({
      negotiationId: id, visibility: 'public', type: 'control_changed',
      payload: { side: 'buyer', mode: 'human' },
    });

    // Run 2: fresh process — event log reloads from disk, market Map starts empty.
    reset(new EventLog(file));
    const market = getMarket();
    const neg = market.negotiations.get(id);

    expect(neg).toBeDefined();
    expect(neg!.status).toBe('active');
    expect(neg!.round).toBe(2); // two priced moves
    expect(neg!.turn).toBe('buyer'); // seller moved last, so it's buyer's turn
    expect(neg!.bundleItemIds).toEqual(['item-001']); // restructure preserved
    expect(neg!.lastOffer).toEqual({ side: 'seller', price: 80, bundleItemIds: ['item-001'] });
    expect(neg!.control.buyer).toBe('human'); // take-over preserved
  });

  it('reconstructs terminal status from status events', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ff-')), 'events.jsonl');
    const log1 = new EventLog(file);
    log1.append({
      negotiationId: 'neg-y', visibility: 'public', type: 'negotiation_created',
      payload: { buyerId: 'buyer-001', sellerId: 'seller-001', itemIds: ['item-001'], roundCap: 8 },
    });
    log1.append({
      negotiationId: 'neg-y', visibility: 'public', type: 'status',
      payload: { status: 'deal', agreedPrice: 55 },
    });

    reset(new EventLog(file));
    const neg = getMarket().negotiations.get('neg-y');
    expect(neg!.status).toBe('deal');
    expect(neg!.agreedPrice).toBe(55);
  });

  it('restores owner approvals, brief/scout context, cap state, and race grouping', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ff-')), 'events.jsonl');
    const log1 = new EventLog(file);
    const id = 'neg-z';
    // brief + scout land BEFORE the negotiation exists — the buffered path.
    log1.append({
      negotiationId: id, visibility: 'buyer_private', type: 'brief_submitted',
      payload: { text: 'tees, £100 max' },
    });
    log1.append({
      negotiationId: id, visibility: 'buyer_private', type: 'scout_report',
      payload: { rationale: 'good tees here', openingPlan: 'open at 30%', briefBudgetMax: 100 },
    });
    log1.append({
      negotiationId: id, visibility: 'public', type: 'negotiation_created',
      payload: { buyerId: 'buyer-001', sellerId: 'seller-001', itemIds: ['item-001'], roundCap: 8 },
    });
    log1.append({
      negotiationId: id, visibility: 'buyer_private', type: 'race_created',
      payload: { raceId: 'race-1', negotiationIds: [id] },
    });
    log1.append({
      negotiationId: id, visibility: 'buyer_private', type: 'cap_raise_requested',
      payload: { addedItemIds: ['item-002'], currentCap: 100, newBundleOracle: 200, suggestedCap: 110 },
    });
    log1.append({
      negotiationId: id, visibility: 'buyer_private', type: 'cap_decision',
      payload: { granted: true, newCap: 140 },
    });
    log1.append({
      negotiationId: id, visibility: 'public', type: 'status',
      payload: { status: 'pending_approval', agreedPrice: 70 },
    });
    log1.append({
      negotiationId: id, visibility: 'public', type: 'approval_decision',
      payload: { side: 'seller', approved: true, auto: true },
    });

    reset(new EventLog(file));
    const neg = getMarket().negotiations.get(id)!;
    expect(neg.buyerBrief).toBe('tees, £100 max');
    expect(neg.scoutNotes).toContain('good tees here');
    expect(neg.raceId).toBe('race-1');
    expect(neg.awaitingCap).toBe(false);
    expect(neg.buyerCap).toBe(140); // cap decision overrides the brief ceiling
    // The surviving seller approval means a post-restart buyer approval closes the deal.
    expect(neg.approvals).toEqual({ seller: true });
  });
});
