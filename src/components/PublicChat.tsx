'use client';
import type { MarketEvent } from '@/lib/types';

export function PublicChat({ negotiationId, events }: { negotiationId: string; events: MarketEvent[] }) {
  const pub = events.filter((e) => e.negotiationId === negotiationId && e.visibility === 'public');

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-2 text-center text-xs uppercase tracking-widest text-zinc-500">
        The negotiation — what both sides see
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
        {pub.map((e) => {
          if (e.type === 'move') {
            const p = e.payload as { side: string; action: string; price?: number; message: string; bundleItemIds?: string[] };
            const isBuyer = p.side === 'buyer';
            return (
              <div key={e.seq} className={`flex ${isBuyer ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${isBuyer ? 'bg-sky-950/70' : 'bg-pink-950/60'}`}>
                  <div className={`mb-1 text-xs font-bold ${isBuyer ? 'text-sky-400' : 'text-pink-400'}`}>
                    {isBuyer ? 'Finn' : 'Flo'} · {p.action}{p.price !== undefined ? ` · £${p.price}` : ''}
                  </div>
                  {p.bundleItemIds && (
                    <div className="mb-1 text-xs text-amber-300">↺ restructured bundle ({p.bundleItemIds.length} items)</div>
                  )}
                  <div className="text-zinc-200">{p.message}</div>
                </div>
              </div>
            );
          }
          if (e.type === 'mediation_result') {
            const p = e.payload as { deal: boolean; price?: number };
            return (
              <div key={e.seq} className="rounded-lg border border-violet-500/40 bg-violet-500/10 p-3 text-center text-sm text-violet-200">
                ⚖️ Mediator: {p.deal ? `deal clears at £${p.price} — neither side's bound revealed` : 'no deal possible'}
              </div>
            );
          }
          if (e.type === 'status') {
            const p = e.payload as { status: string; agreedPrice?: number };
            return (
              <div key={e.seq} className="rounded-lg bg-zinc-800 p-2 text-center text-xs uppercase tracking-widest text-zinc-400">
                {p.status.replace(/_/g, ' ')}{p.agreedPrice ? ` — £${p.agreedPrice}` : ''}
              </div>
            );
          }
          if (e.type === 'negotiation_created') {
            const p = e.payload as { oracleValue: number; itemIds: string[]; buyerShop: string; sellerWarehouse: string };
            return (
              <div key={e.seq} className="rounded-lg bg-zinc-800/60 p-2 text-center text-xs text-zinc-400">
                {p.buyerShop} ⇄ {p.sellerWarehouse} · {p.itemIds.length} items · oracle resale value £{p.oracleValue}
              </div>
            );
          }
          if (e.type === 'control_changed') {
            const p = e.payload as { side: string; mode: string };
            return (
              <div key={e.seq} className="p-1 text-center text-xs text-amber-400">
                {p.side} side: {p.mode === 'human' ? 'HUMAN TAKEOVER' : 'agent resumed'}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
