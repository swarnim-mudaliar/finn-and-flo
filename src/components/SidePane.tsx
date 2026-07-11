'use client';
import type { MarketEvent, Side } from '@/lib/types';
import { MoveForm } from './MoveForm';

const META: Record<Side, { name: string; color: string; label: string }> = {
  seller: { name: 'Flo', color: 'text-pink-400', label: 'sells for the supplier' },
  buyer: { name: 'Finn', color: 'text-sky-400', label: 'buys for the reseller' },
};

export function SidePane({
  side, negotiationId, events, humanControlled, principal,
}: {
  side: Side;
  negotiationId: string;
  events: MarketEvent[];
  humanControlled: boolean;
  principal: string;
}) {
  const meta = META[side];
  const vis = side === 'buyer' ? 'buyer_private' : 'seller_private';
  const mine = events.filter(
    (e) => e.negotiationId === negotiationId && e.visibility === vis
  );

  async function toggle(): Promise<void> {
    await fetch('/api/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ negotiationId, side, mode: humanControlled ? 'agent' : 'human' }),
    });
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <span className={`text-lg font-bold ${meta.color}`}>{meta.name}</span>
          <span className="ml-2 text-xs text-zinc-400">{meta.label} · {principal}</span>
        </div>
        <button onClick={toggle}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
          {humanControlled ? 'Return to agent' : 'Take over'}
        </button>
      </div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
        Private reasoning — only {side} sees this
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
        {mine.map((e) => (
          <div key={e.seq}
            className={`rounded-lg p-2 text-sm ${
              e.type === 'mediation_sealed'
                ? 'border border-violet-500/40 bg-violet-500/10 text-violet-200'
                : e.type === 'validation_warning'
                ? 'border border-amber-500/30 bg-amber-500/5 text-amber-200'
                : 'bg-zinc-800/80 text-zinc-300'
            }`}>
            {e.type === 'mediation_sealed'
              ? `🔒 Sealed disclosure to mediator: £${e.payload.value as number}`
              : (e.payload.text as string)}
          </div>
        ))}
      </div>
      {humanControlled && <MoveForm negotiationId={negotiationId} side={side} />}
    </div>
  );
}
