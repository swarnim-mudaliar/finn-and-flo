import { getEventLog } from '@/lib/eventlog';
import { getMarket } from '@/lib/market';
import { startNegotiationFromScout } from '@/lib/runner';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const { negotiationId, proceed } = (await req.json()) as {
    negotiationId: string;
    proceed: boolean;
  };
  const market = getMarket();
  const plan = market.pendingScouts.get(negotiationId);
  if (!plan) return Response.json({ error: 'no scout decision pending' }, { status: 400 });

  market.pendingScouts.delete(negotiationId);
  getEventLog().append({
    negotiationId,
    visibility: 'buyer_private',
    type: 'scout_decision',
    payload: { proceed },
  });
  if (proceed) {
    startNegotiationFromScout(negotiationId, { ...plan, substitute: true });
  }
  return Response.json({ ok: true });
}
