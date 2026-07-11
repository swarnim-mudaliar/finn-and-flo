'use client';
import { useEffect, useRef } from 'react';
import type { MarketEvent } from '@/lib/types';

export function PublicChat({
  negotiationId,
  events,
}: {
  negotiationId: string;
  events: MarketEvent[];
}) {
  const pub = events.filter((e) => e.negotiationId === negotiationId && e.visibility === 'public');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [pub.length]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-4 py-[18px]">
        <span className="microlabel">The floor</span>
        <span className="h-px flex-1 bg-line" />
        <span className="microlabel">what both sides see</span>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {pub.map((e) => {
          if (e.type === 'move') {
            const p = e.payload as {
              side: string;
              action: string;
              price?: number;
              message: string;
              bundleItemIds?: string[];
            };
            const isBuyer = p.side === 'buyer';
            const accepted = p.action === 'accept';
            return (
              <div key={e.seq} className={`animate-rise flex ${isBuyer ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl border bg-panel-2 p-3.5 ${
                    isBuyer ? 'border-finn/25 rounded-tr-md' : 'border-flo/25 rounded-tl-md'
                  }`}
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-4">
                    <span
                      className={`font-display text-[15px] italic ${isBuyer ? 'text-finn' : 'text-flo'}`}
                    >
                      {isBuyer ? 'Finn' : 'Flo'}
                      <span className="microlabel ml-2 !tracking-[0.14em]">
                        {p.action.replace(/_/g, ' ')}
                      </span>
                    </span>
                    {p.price !== undefined && (
                      <span
                        className={`font-mono text-lg font-medium tabular-nums ${
                          accepted ? 'text-deal' : 'text-brass'
                        }`}
                      >
                        £{p.price}
                      </span>
                    )}
                  </div>
                  {p.bundleItemIds && (
                    <div className="mb-2 inline-block rounded-md border border-dashed border-brass/40 bg-brass-deep/50 px-2 py-0.5 text-[11px] text-brass">
                      ✂ bundle restructured → {p.bundleItemIds.length} items
                    </div>
                  )}
                  <div className="text-[13.5px] leading-relaxed text-cream/85">{p.message}</div>
                </div>
              </div>
            );
          }
          if (e.type === 'mediation_result') {
            const p = e.payload as { deal: boolean; price?: number };
            return (
              <div
                key={e.seq}
                className="animate-rise animate-sealpulse mx-auto max-w-[80%] rounded-2xl border border-seal/40 bg-seal-deep p-4 text-center"
              >
                <div className="microlabel mb-1 !text-seal">⚖ Mediation</div>
                {p.deal ? (
                  <>
                    <div className="font-display text-xl text-seal">
                      Deal cleared at <span className="font-mono not-italic">£{p.price}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-seal/60">
                      neither side&apos;s number was revealed
                    </div>
                  </>
                ) : (
                  <div className="font-display text-xl text-seal">No deal is possible.</div>
                )}
              </div>
            );
          }
          if (e.type === 'status') {
            const p = e.payload as { status: string; agreedPrice?: number };
            const good = p.status === 'deal' || p.status === 'mediated_deal';
            return (
              <div key={e.seq} className="animate-rise flex justify-center py-1">
                <span
                  className={`rounded-full border px-4 py-1.5 text-[11px] font-semibold tracking-[0.18em] uppercase ${
                    good
                      ? 'border-deal/40 bg-deal-deep text-deal'
                      : 'border-line-2 bg-panel-2 text-muted'
                  }`}
                >
                  {p.status.replace(/_/g, ' ')}
                  {p.agreedPrice !== undefined && (
                    <span className="ml-2 font-mono tabular-nums">£{p.agreedPrice}</span>
                  )}
                </span>
              </div>
            );
          }
          if (e.type === 'negotiation_created') {
            const p = e.payload as {
              oracleValue: number;
              itemIds: string[];
              buyerShop: string;
              sellerWarehouse: string;
            };
            return (
              <div
                key={e.seq}
                className="animate-rise mx-auto max-w-[85%] rounded-xl border border-line bg-panel-2 px-4 py-3 text-center"
              >
                <div className="font-display text-[15px] text-cream/90">
                  <span className="text-flo">{p.sellerWarehouse}</span>
                  <span className="mx-2 text-faint">⇄</span>
                  <span className="text-finn">{p.buyerShop}</span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted">
                  {p.itemIds.length} items · oracle resale value{' '}
                  <span className="text-brass">£{p.oracleValue}</span>
                </div>
              </div>
            );
          }
          if (e.type === 'control_changed') {
            const p = e.payload as { side: string; mode: string };
            return (
              <div key={e.seq} className="animate-rise text-center text-[11px] tracking-[0.14em] uppercase text-alarm">
                {p.side}: {p.mode === 'human' ? 'human takeover' : 'agent resumed'}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
