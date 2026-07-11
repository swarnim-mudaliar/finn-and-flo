'use client';
import { useEffect, useRef } from 'react';
import type { MarketEvent, Side } from '@/lib/types';
import { MoveForm } from './MoveForm';

const META: Record<
  Side,
  { name: string; text: string; bg: string; border: string; label: string }
> = {
  seller: {
    name: 'Flo',
    text: 'text-flo',
    bg: 'bg-flo-deep',
    border: 'border-flo/30',
    label: 'sells for the supplier',
  },
  buyer: {
    name: 'Finn',
    text: 'text-finn',
    bg: 'bg-finn-deep',
    border: 'border-finn/30',
    label: 'buys for the reseller',
  },
};

export function SidePane({
  side,
  negotiationId,
  events,
  humanControlled,
  principal,
  thinking,
}: {
  side: Side;
  negotiationId: string;
  events: MarketEvent[];
  humanControlled: boolean;
  principal: string;
  thinking: boolean;
}) {
  const meta = META[side];
  const vis = side === 'buyer' ? 'buyer_private' : 'seller_private';
  const mine = events.filter((e) => e.negotiationId === negotiationId && e.visibility === vis);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [mine.length, thinking]);

  async function toggle(): Promise<void> {
    await fetch('/api/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ negotiationId, side, mode: humanControlled ? 'agent' : 'human' }),
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full border ${meta.border} ${meta.bg} font-display text-lg italic ${meta.text}`}
          >
            {meta.name[0]}
          </span>
          <div className="leading-tight">
            <div className={`font-display text-lg italic ${meta.text}`}>{meta.name}</div>
            <div className="text-[11px] text-muted">
              {meta.label} · <span className="text-cream/80">{principal}</span>
            </div>
          </div>
        </div>
        <button
          onClick={toggle}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
            humanControlled
              ? 'border-alarm/50 bg-alarm-deep text-alarm hover:bg-alarm/20'
              : 'border-line-2 text-muted hover:border-faint hover:text-cream'
          }`}
        >
          {humanControlled ? 'Return to agent' : 'Take over'}
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="microlabel">Private ledger</span>
        <span className="h-px flex-1 bg-line" />
        <span className="microlabel">only {side} sees this</span>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {mine.map((e) =>
          e.type === 'mediation_sealed' ? (
            <div
              key={e.seq}
              className="animate-rise animate-sealpulse rounded-xl border border-seal/40 bg-seal-deep p-3"
            >
              <div className="microlabel mb-1 !text-seal">Sealed to mediator</div>
              <div className="font-mono text-xl text-seal">
                £{e.payload.value as number}
                <span className="ml-2 text-[11px] text-seal/60">never enters the room</span>
              </div>
            </div>
          ) : e.type === 'validation_warning' ? (
            <div
              key={e.seq}
              className="animate-rise rounded-xl border border-alarm/30 bg-alarm-deep/60 p-3 text-[13px] text-alarm"
            >
              ⚠ {e.payload.text as string}
            </div>
          ) : (
            <div
              key={e.seq}
              className={`animate-rise border-l-2 ${meta.border} pl-3 font-display text-[13.5px] leading-relaxed italic text-cream/75`}
            >
              {e.payload.text as string}
            </div>
          )
        )}
        {thinking && (
          <div className={`flex items-center gap-2 pl-3 text-[13px] italic ${meta.text}`}>
            <span className="font-display">{meta.name} is thinking</span>
            <span className="flex gap-1">
              <span className={`thinkdot h-1.5 w-1.5 rounded-full ${meta.bg} ${meta.text} bg-current`} />
              <span className="thinkdot h-1.5 w-1.5 rounded-full bg-current" />
              <span className="thinkdot h-1.5 w-1.5 rounded-full bg-current" />
            </span>
          </div>
        )}
        {mine.length === 0 && !thinking && (
          <div className="pt-6 text-center text-[12px] text-faint">No private notes yet.</div>
        )}
      </div>

      {humanControlled && (
        <div className="border-t border-line p-3">
          <MoveForm negotiationId={negotiationId} side={side} />
        </div>
      )}
    </div>
  );
}
