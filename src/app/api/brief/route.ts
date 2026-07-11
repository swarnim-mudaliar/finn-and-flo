import { scoutBundle, scoutRace } from '@/lib/agents';
import { getEventLog } from '@/lib/eventlog';
import { getMarket } from '@/lib/market';
import { runNegotiation, startNegotiationFromScout } from '@/lib/runner';

export const dynamic = 'force-dynamic';

function newNegId(): string {
  return `neg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function POST(req: Request): Promise<Response> {
  const { buyerId, brief, race } = (await req.json()) as {
    buyerId: string;
    brief: string;
    race?: boolean;
  };
  const market = getMarket();
  if (!brief?.trim()) return Response.json({ error: 'brief required' }, { status: 400 });
  if (market.negotiations.size >= 60) {
    return Response.json(
      { error: 'live-negotiation cap reached for this deployment — use Replay to watch recorded runs' },
      { status: 429 }
    );
  }

  const log = getEventLog();
  const id = newNegId();
  log.append({
    negotiationId: id,
    visibility: 'buyer_private',
    type: 'brief_submitted',
    payload: { text: brief.trim() },
  });

  // Scout + negotiate in the background; the UI follows along on the event stream.
  void (async () => {
    try {
      if (race) {
        const scout = await scoutRace(market, buyerId, brief.trim());
        // The honesty gate outranks the race: a brief nothing genuinely serves degrades
        // to the single-substitute flow — owner decides pursue/close, no race launches.
        if (scout.matchQuality !== 'good' || scout.candidates.length < 2) {
          const best = scout.candidates[0];
          log.append({
            negotiationId: id,
            visibility: 'buyer_private',
            type: 'scout_report',
            payload: {
              sellerId: best.sellerId,
              sellerName: market.seller(best.sellerId).warehouseName,
              rationale:
                scout.candidates.length < 2 && scout.matchQuality === 'good'
                  ? `${best.rationale} (Only one supplier genuinely serves this brief — proceeding single-store.)`
                  : best.rationale,
              openingPlan: best.openingPlan,
              itemIds: best.itemIds,
              briefBudgetMax: scout.briefBudgetMax,
              matchQuality: scout.matchQuality,
            },
          });
          if (scout.matchQuality !== 'good') {
            market.pendingScouts.set(id, {
              buyerId,
              brief: brief.trim(),
              sellerId: best.sellerId,
              itemIds: best.itemIds,
              rationale: best.rationale,
              openingPlan: best.openingPlan,
              briefBudgetMax: scout.briefBudgetMax,
            });
            return;
          }
          startNegotiationFromScout(id, {
            buyerId,
            brief: brief.trim(),
            sellerId: best.sellerId,
            itemIds: best.itemIds,
            rationale: best.rationale,
            openingPlan: best.openingPlan,
            briefBudgetMax: scout.briefBudgetMax,
          });
          return;
        }

        const raceId = `race-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`;
        const ids = scout.candidates.map((_, i) => (i === 0 ? id : newNegId()));
        // Create every lane first (deferRun) so RACE INTEL never sees a half-built race,
        // then emit the race grouping per lane, then start the engines together.
        scout.candidates.forEach((c, i) => {
          if (i > 0) {
            log.append({
              negotiationId: ids[i],
              visibility: 'buyer_private',
              type: 'brief_submitted',
              payload: { text: brief.trim() },
            });
          }
          log.append({
            negotiationId: ids[i],
            visibility: 'buyer_private',
            type: 'scout_report',
            payload: {
              sellerId: c.sellerId,
              sellerName: market.seller(c.sellerId).warehouseName,
              rationale: c.rationale,
              openingPlan: c.openingPlan,
              itemIds: c.itemIds,
              briefBudgetMax: scout.briefBudgetMax,
              matchQuality: scout.matchQuality,
            },
          });
          startNegotiationFromScout(
            ids[i],
            {
              buyerId,
              brief: brief.trim(),
              sellerId: c.sellerId,
              itemIds: c.itemIds,
              rationale: c.rationale,
              openingPlan: c.openingPlan,
              briefBudgetMax: scout.briefBudgetMax,
            },
            { raceId, deferRun: true }
          );
        });
        for (const nid of ids) {
          log.append({
            negotiationId: nid,
            visibility: 'buyer_private',
            type: 'race_created',
            payload: { raceId, negotiationIds: ids },
          });
        }
        for (const nid of ids) void runNegotiation(nid);
        return;
      }

      const scout = await scoutBundle(market, buyerId, brief.trim());
      const sellerId = scout.sellerId;
      const sellerName = market.seller(sellerId).warehouseName;
      log.append({
        negotiationId: id,
        visibility: 'buyer_private',
        type: 'scout_report',
        payload: {
          sellerId,
          sellerName,
          rationale: scout.rationale,
          openingPlan: scout.openingPlan,
          itemIds: scout.itemIds,
          briefBudgetMax: scout.briefBudgetMax,
          matchQuality: scout.matchQuality,
        },
      });

      // Finn says no: anything short of a genuine match stops here. The owner
      // decides whether to pursue the closest substitute — /api/scout-decision.
      if (scout.matchQuality !== 'good') {
        market.pendingScouts.set(id, {
          buyerId,
          brief: brief.trim(),
          sellerId,
          itemIds: scout.itemIds,
          rationale: scout.rationale,
          openingPlan: scout.openingPlan,
          briefBudgetMax: scout.briefBudgetMax,
        });
        return;
      }

      startNegotiationFromScout(id, {
        buyerId,
        brief: brief.trim(),
        sellerId,
        itemIds: scout.itemIds,
        rationale: scout.rationale,
        openingPlan: scout.openingPlan,
        briefBudgetMax: scout.briefBudgetMax,
      });
    } catch (err) {
      log.append({
        negotiationId: id,
        visibility: 'buyer_private',
        type: 'scout_failed',
        payload: { text: `Scouting failed: ${err instanceof Error ? err.message : 'unknown error'}. Try again.` },
      });
    }
  })();

  return Response.json({ id });
}
