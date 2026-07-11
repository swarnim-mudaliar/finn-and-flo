import { getEventLog } from '@/lib/eventlog';

export const dynamic = 'force-dynamic';

let replayCounter = 0;

export async function POST(req: Request): Promise<Response> {
  const { negotiationId, speedMs } = (await req.json()) as { negotiationId: string; speedMs?: number };
  const log = getEventLog();
  const events = log.byNegotiation(negotiationId);
  if (events.length === 0) return Response.json({ error: 'no events for that negotiation' }, { status: 404 });

  const replayId = `${negotiationId}-replay-${++replayCounter}`;
  const delay = speedMs ?? 900;

  void (async () => {
    for (const e of events) {
      log.append({ negotiationId: replayId, visibility: e.visibility, type: e.type, payload: e.payload });
      await new Promise((r) => setTimeout(r, delay));
    }
  })();

  return Response.json({ replayId });
}
