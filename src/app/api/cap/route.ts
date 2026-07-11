import { decideCap } from '@/lib/runner';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const { negotiationId, newCap } = (await req.json()) as {
    negotiationId: string;
    newCap: number | null; // null = decline the raise
  };
  const result = decideCap(negotiationId, newCap);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
