import { scoutBundle } from '@/lib/agents';
import { getEventLog } from '@/lib/eventlog';
import { getMarket } from '@/lib/market';
import { startNegotiationFromScout } from '@/lib/runner';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const { buyerId, brief } = (await req.json()) as {
    buyerId: string;
    brief: string;
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
  const id = `neg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  log.append({
    negotiationId: id,
    visibility: 'buyer_private',
    type: 'brief_submitted',
    payload: { text: brief.trim() },
  });

  // Scout + negotiate in the background; the UI follows along on the event stream.
  void (async () => {
    try {
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
