import type { NextRequest } from 'next/server';
import { getEventLog } from '@/lib/eventlog';
import type { MarketEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const since = Number(req.nextUrl.searchParams.get('since') ?? 0);
  const log = getEventLog();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: MarketEvent): void => {
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
