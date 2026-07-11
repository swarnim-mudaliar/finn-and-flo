import type { MarketEvent, OraclePrice, Side } from './types';

// Everything the deal-summary card shows, derived PURELY from public events plus the
// oracle map — never from server state — so it renders identically live, on refresh
// backfill, in replays, and in the seller-scoped judge view.

export interface TrajectoryPoint {
  seq: number;
  side: Side;
  price: number;
  /** Bundle size the price refers to (the proposed bundle for restructures). */
  bundleSize: number;
  /** This move changed the bundle's composition. */
  bundleChanged: boolean;
  kind: 'offer' | 'accept' | 'mediation';
}

export interface BundleChange {
  seq: number;
  side: Side;
  added: string[];
  dropped: string[];
  fromCount: number;
  toCount: number;
  fromOracle: number;
  toOracle: number;
  /** The change survived into the final bundle (additions stayed / drops stayed out). */
  keptInFinal: boolean;
}

export interface OwnerDecision {
  side: Side;
  approved: boolean;
  note?: string;
  auto?: boolean;
}

export interface DealSummaryData {
  outcome:
    | 'deal'
    | 'mediated_deal'
    | 'walked_away'
    | 'mediation_no_deal'
    | 'pending_approval'
    | 'reopened';
  finalPrice?: number;
  /** Rounds consumed (offers, counters, rejects — mirrors the server's round meter). */
  rounds: number;
  mediated: boolean;
  trajectory: TrajectoryPoint[];
  openingItemIds: string[];
  openingOracle: number;
  finalItemIds: string[];
  finalOracle: number;
  changes: BundleChange[];
  /** Each side's LAST owner decision (the one that stood). */
  finalApprovals: OwnerDecision[];
  /** Times a provisional handshake was sent back before the final outcome. */
  sendBacks: number;
  /** Only for a pending handshake: the sides whose sign-off is still missing. */
  awaiting: Side[];
}

// The summary appears at the FIRST handshake — the owner reads it to decide whether to
// sign — and never disappears after that: a send-back flips it to 'reopened' (a live
// scoreboard of the renewed haggle) until the next handshake or a terminal state.
const SUMMARISABLE = new Set(['pending_approval', 'deal', 'mediated_deal', 'walked_away', 'mediation_no_deal']);

export function bundleOracle(itemIds: string[], oracle: Record<string, OraclePrice>): number {
  // Must mirror Market.bundleValue exactly: rounded sum of estimates.
  return Math.round(itemIds.reduce((sum, id) => sum + (oracle[id]?.estimate ?? 0), 0));
}

export function deriveDealSummary(
  events: MarketEvent[],
  negotiationId: string,
  oracle: Record<string, OraclePrice>
): DealSummaryData | null {
  const pub = events.filter((e) => e.negotiationId === negotiationId && e.visibility === 'public');
  const statuses = pub.filter((e) => e.type === 'status');
  const last = statuses[statuses.length - 1]?.payload as
    | { status?: string; agreedPrice?: number }
    | undefined;
  const everShook = statuses.some(
    (s) => (s.payload as { status?: string }).status === 'pending_approval'
  );
  if (!last?.status || (!SUMMARISABLE.has(last.status) && !everShook)) return null;
  const outcome = SUMMARISABLE.has(last.status)
    ? (last.status as DealSummaryData['outcome'])
    : 'reopened';

  const created = pub.find((e) => e.type === 'negotiation_created');
  if (!created) return null;
  const openingItemIds = (created.payload as { itemIds: string[] }).itemIds;

  const trajectory: TrajectoryPoint[] = [];
  const changes: BundleChange[] = [];
  let rounds = 0;
  let bundle = openingItemIds;

  for (const e of pub) {
    if (e.type === 'move') {
      const p = e.payload as {
        side: Side;
        action: string;
        price?: number;
        bundleItemIds?: string[];
      };
      const priced = p.action === 'offer' || p.action === 'counter';
      if (priced || p.action === 'reject') rounds += 1;
      const next = priced ? (p.bundleItemIds ?? bundle) : bundle;
      const changed =
        priced &&
        p.bundleItemIds !== undefined &&
        JSON.stringify([...next].sort()) !== JSON.stringify([...bundle].sort());
      if (changed) {
        const cur = new Set(bundle);
        const nxt = new Set(next);
        changes.push({
          seq: e.seq,
          side: p.side,
          added: next.filter((id) => !cur.has(id)),
          dropped: bundle.filter((id) => !nxt.has(id)),
          fromCount: bundle.length,
          toCount: next.length,
          fromOracle: bundleOracle(bundle, oracle),
          toOracle: bundleOracle(next, oracle),
          keptInFinal: false, // resolved after the walk, once the final bundle is known
        });
      }
      if (priced && p.price !== undefined) {
        trajectory.push({
          seq: e.seq,
          side: p.side,
          price: p.price,
          bundleSize: next.length,
          bundleChanged: changed,
          kind: 'offer',
        });
      }
      if (p.action === 'accept') {
        // An accept always closes at the standing offer's price (the server normalizes
        // it), so promote that offer to the settle point rather than drawing a
        // duplicate dot at the same price.
        const lastPoint = trajectory[trajectory.length - 1];
        if (lastPoint?.kind === 'offer') lastPoint.kind = 'accept';
      }
      bundle = next;
    }
    if (e.type === 'mediation_result') {
      const p = e.payload as { deal: boolean; price?: number };
      if (p.deal && p.price !== undefined) {
        trajectory.push({
          seq: e.seq,
          side: 'buyer', // rendered neutrally; side is not meaningful for the mediator
          price: p.price,
          bundleSize: bundle.length,
          bundleChanged: false,
          kind: 'mediation',
        });
      }
    }
  }

  const finalSet = new Set(bundle);
  for (const c of changes) {
    const additionsKept = c.added.every((id) => finalSet.has(id));
    const dropsKept = c.dropped.every((id) => !finalSet.has(id));
    c.keptInFinal = additionsKept && dropsKept;
  }

  const decisions = pub.filter((e) => e.type === 'approval_decision');
  const lastBySide = new Map<Side, OwnerDecision>();
  let sendBacks = 0;
  for (const e of decisions) {
    const p = e.payload as unknown as OwnerDecision;
    if (!p.approved) sendBacks += 1;
    lastBySide.set(p.side, p);
  }
  // Rejections that stood (walked_away etc.) still count as the standing decision;
  // for closed deals both entries are the approvals that sealed it.
  const finalApprovals = [...lastBySide.values()];

  // For a live handshake, only approvals given since THIS pending round count — an
  // approval from before a send-back must not read as a current signature.
  let awaiting: Side[] = [];
  if (outcome === 'pending_approval') {
    const lastPendingSeq =
      [...statuses]
        .reverse()
        .find((s) => (s.payload as { status?: string }).status === 'pending_approval')?.seq ?? 0;
    const current = new Set(
      decisions
        .filter((e) => e.seq > lastPendingSeq && (e.payload as unknown as OwnerDecision).approved)
        .map((e) => (e.payload as unknown as OwnerDecision).side)
    );
    awaiting = (['seller', 'buyer'] as Side[]).filter((s) => !current.has(s));
  }

  return {
    outcome,
    finalPrice: outcome === 'reopened' ? undefined : last.agreedPrice,
    rounds,
    mediated: outcome === 'mediated_deal' || pub.some((e) => e.type === 'mediation_result'),
    trajectory,
    openingItemIds,
    openingOracle: bundleOracle(openingItemIds, oracle),
    finalItemIds: bundle,
    finalOracle: bundleOracle(bundle, oracle),
    changes,
    finalApprovals,
    sendBacks,
    awaiting,
  };
}
