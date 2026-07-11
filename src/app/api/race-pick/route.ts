import { settleRace } from '@/lib/runner';

export const dynamic = 'force-dynamic';

// The buyer's owner takes ONE deal from a race; Finn walks away from every other lane.
export async function POST(req: Request): Promise<Response> {
  const { winnerNegotiationId } = (await req.json()) as { winnerNegotiationId: string };
  if (!winnerNegotiationId) {
    return Response.json({ error: 'winnerNegotiationId required' }, { status: 400 });
  }
  const result = settleRace(winnerNegotiationId);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
