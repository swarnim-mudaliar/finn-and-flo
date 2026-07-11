import { consentMediation } from '@/lib/runner';
import type { Side } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const { negotiationId, side } = (await req.json()) as { negotiationId: string; side: Side };
  const result = consentMediation(negotiationId, side);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
