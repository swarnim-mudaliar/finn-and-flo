import type { NextRequest } from 'next/server';
import { getEventLog } from '@/lib/eventlog';
import type { MarketEvent, Side } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Server-side visibility gate. Default (no ?side): the single-screen war room sees
// everything (both private panes are meant to be on the presenter's screen). When a
// client scopes itself with ?side=buyer|seller, the OTHER side's private events —
// including mediation_sealed bounds and the opposing agent's reasoning — never leave
// the server, so DevTools on a scoped viewer cannot reveal them.
function visibleTo(e: MarketEvent, side: Side | null): boolean {
  if (!side) return true;
  const forbidden = side === 'buyer' ? 'seller_private' : 'buyer_private';
  return e.visibility !== forbidden;
}

export async function GET(req: NextRequest): Promise<Response> {
  const since = Number(req.nextUrl.searchParams.get('since') ?? 0);
  const sideParam = req.nextUrl.searchParams.get('side');
  const side: Side | null = sideParam === 'buyer' || sideParam === 'seller' ? sideParam : null;
  const log = getEventLog();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: MarketEvent): void => {
        if (!visibleTo(e, side)) return;
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      for (const e of log.since(since)) send(e); // backfill — a refresh never blanks the UI
      const unsub = log.subscribe(send);
      const ping = setInterval(() => controller.enqueue(enc.encode(': ping\n\n')), 15000);
      req.signal.addEventListener('abort', () => {
        unsub();
        clearInterval(ping);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
