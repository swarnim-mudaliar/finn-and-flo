import { getEventLog } from '@/lib/eventlog';
import { getMarket } from '@/lib/market';
import { runNegotiation } from '@/lib/runner';
import type { NegotiationState } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const { buyerId, sellerId, itemIds, roundCap } = (await req.json()) as {
    buyerId: string; sellerId: string; itemIds: string[]; roundCap?: number;
  };
  const market = getMarket();
  if (!itemIds?.length) return Response.json({ error: 'itemIds required' }, { status: 400 });

  // Public-deployment cost guard: each negotiation is ~10 live LLM calls. Cap the
  // total this server will run; replays stay free and unlimited.
  if (market.negotiations.size >= 60) {
    return Response.json(
      { error: 'live-negotiation cap reached for this deployment — use Replay to watch recorded runs' },
      { status: 429 }
    );
  }

  const id = `neg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const neg: NegotiationState = {
    id, buyerId, sellerId, bundleItemIds: itemIds,
    turn: 'buyer', status: 'active', round: 0, roundCap: roundCap ?? 8,
    control: { buyer: 'agent', seller: 'agent' },
  };
  market.negotiations.set(id, neg);
  getEventLog().append({
    negotiationId: id,
    visibility: 'public',
    type: 'negotiation_created',
    payload: {
      buyerId, sellerId, itemIds,
      roundCap: neg.roundCap,
      oracleValue: market.bundleValue(itemIds),
      buyerShop: market.buyer(buyerId).shopName,
      sellerWarehouse: market.seller(sellerId).warehouseName,
    },
  });
  void runNegotiation(id); // fire and forget — progress streams via SSE
  return Response.json({ id });
}
