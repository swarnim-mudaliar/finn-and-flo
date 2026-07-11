import { getEventLog } from '@/lib/eventlog';
import { getMarket } from '@/lib/market';
import { runNegotiation } from '@/lib/runner';
import type { Side } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const { negotiationId, side, mode } = (await req.json()) as {
    negotiationId: string; side: Side; mode: 'agent' | 'human';
  };
  const market = getMarket();
  const neg = market.negotiations.get(negotiationId);
  if (!neg) return Response.json({ error: 'unknown negotiation' }, { status: 404 });

  neg.control[side] = mode;
  market.negotiations.set(negotiationId, neg);
  getEventLog().append({
    negotiationId,
    visibility: 'public',
    type: 'control_changed',
    payload: { side, mode },
  });
  if (mode === 'agent') void runNegotiation(negotiationId);
  return Response.json({ ok: true });
}
