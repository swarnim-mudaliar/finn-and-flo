import type { MarketEvent, Side } from './types';

// Race views are derived purely from the buyer-visible event stream. The public room
// carries no race grouping at all, so the seller-scoped judge stream can never
// reconstruct who else Finn is talking to — these helpers simply find nothing there.

export interface RaceMemberView {
  id: string;
  sellerWarehouse: string;
  /** Latest status ('active' until a status event says otherwise). */
  status: string;
  /** Last priced position on this lane's table. */
  lastPrice?: number;
  lastSide?: Side;
  agreedPrice?: number;
  /** Current bundle after any restructures. */
  bundleItemIds: string[];
  /** Paused on a buyer-owner decision (upsell ceiling) — the race can't end until answered. */
  needsAttention: boolean;
}

export interface RaceView {
  raceId: string;
  members: RaceMemberView[];
  settled: boolean;
  winnerId?: string;
}

export function deriveRace(events: MarketEvent[], negotiationId: string): RaceView | null {
  const rc = events.find(
    (e) => e.negotiationId === negotiationId && e.type === 'race_created'
  );
  if (!rc) return null;
  const { raceId, negotiationIds } = rc.payload as { raceId: string; negotiationIds: string[] };

  const settledEv = events.find(
    (e) => e.negotiationId === negotiationId && e.type === 'race_settled'
  );

  const members = negotiationIds.map((id): RaceMemberView => {
    const mine = events.filter((e) => e.negotiationId === id);
    const created = mine.find((e) => e.type === 'negotiation_created');
    const cp = (created?.payload ?? {}) as { sellerWarehouse?: string; itemIds?: string[] };
    let bundle = cp.itemIds ?? [];
    let lastPrice: number | undefined;
    let lastSide: Side | undefined;
    for (const e of mine) {
      if (e.type !== 'move') continue;
      const p = e.payload as { side: Side; action: string; price?: number; bundleItemIds?: string[] };
      if ((p.action === 'offer' || p.action === 'counter') && p.price !== undefined) {
        lastPrice = p.price;
        lastSide = p.side;
        if (p.bundleItemIds) bundle = p.bundleItemIds;
      }
    }
    const statuses = mine.filter((e) => e.type === 'status');
    const sp = (statuses[statuses.length - 1]?.payload ?? {}) as { status?: string; agreedPrice?: number };
    const capReqs = mine.filter((e) => e.type === 'cap_raise_requested');
    const lastCapReq = capReqs[capReqs.length - 1];
    const needsAttention =
      lastCapReq !== undefined && !mine.some((e) => e.type === 'cap_decision' && e.seq > lastCapReq.seq);
    return {
      id,
      sellerWarehouse: cp.sellerWarehouse ?? id,
      status: sp.status ?? 'active',
      lastPrice,
      lastSide,
      agreedPrice: sp.agreedPrice,
      bundleItemIds: bundle,
      needsAttention,
    };
  });

  return {
    raceId,
    members,
    settled: settledEv !== undefined,
    winnerId: settledEv ? (settledEv.payload as { winner: string }).winner : undefined,
  };
}

const RACING = new Set(['active', 'mediation']);

/** Every lane has stopped racing and at least one handshake is on the table. */
export function raceReadyToPick(view: RaceView): boolean {
  return (
    !view.settled &&
    view.members.every((m) => !RACING.has(m.status) && !m.needsAttention) &&
    view.members.some((m) => m.status === 'pending_approval')
  );
}
