import { scoutBundle } from '@/lib/agents';
import { getEventLog } from '@/lib/eventlog';
import { getMarket } from '@/lib/market';
import { runNegotiation } from '@/lib/runner';
import type { NegotiationState } from '@/lib/types';

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
        },
      });
      const neg: NegotiationState = {
        id,
        buyerId,
        sellerId,
        buyerBrief: brief.trim(),
        scoutNotes: `${scout.rationale} Opening plan: ${scout.openingPlan}`,
        buyerCap: scout.briefBudgetMax,
        bundleItemIds: scout.itemIds,
        turn: 'buyer',
        status: 'active',
        round: 0,
        roundCap: 8,
        control: { buyer: 'agent', seller: 'agent' },
      };
      market.negotiations.set(id, neg);
      log.append({
        negotiationId: id,
        visibility: 'public',
        type: 'negotiation_created',
        payload: {
          buyerId,
          sellerId,
          itemIds: scout.itemIds,
          oracleValue: market.bundleValue(scout.itemIds),
          buyerShop: market.buyer(buyerId).shopName,
          sellerWarehouse: market.seller(sellerId).warehouseName,
        },
      });
      await runNegotiation(id);
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
