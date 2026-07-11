import { getMarket } from '@/lib/market';
import { validateMove } from '@/lib/negotiation';
import { applyAndEmit, runNegotiation } from '@/lib/runner';
import type { MoveInput, Side } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const { negotiationId, side, move } = (await req.json()) as {
    negotiationId: string; side: Side; move: MoveInput;
  };
  const market = getMarket();
  const neg = market.negotiations.get(negotiationId);
  if (!neg) return Response.json({ error: 'unknown negotiation' }, { status: 404 });
  if (neg.control[side] !== 'human') {
    return Response.json({ error: `${side} is not under human control` }, { status: 400 });
  }
  const result = validateMove(neg, side, move, market.validationCtx(neg));
  if (!result.ok) return Response.json({ error: result.reason }, { status: 400 });

  applyAndEmit(negotiationId, side, move, result.warnings);
  void runNegotiation(negotiationId); // agent side responds (or mediation runs)
  return Response.json({ ok: true });
}
