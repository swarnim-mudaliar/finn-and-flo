'use client';
import type { MarketEvent } from '@/lib/types';
import { deriveRace } from '@/lib/race';

// One chip per store Finn is racing. Renders only when the buyer-visible stream carries
// the race grouping — the seller-scoped judge view never receives it, so a supplier
// (or a judge playing one) can't see who else Finn is talking to.

const DOT: Record<string, string> = {
  active: 'bg-brass animate-pulse',
  pending_approval: 'bg-deal',
  deal: 'bg-deal',
  mediated_deal: 'bg-deal',
  escalated: 'bg-seal',
  mediation: 'bg-seal',
  walked_away: 'bg-faint',
  mediation_no_deal: 'bg-faint',
};

export function RaceStrip({
  events,
  activeNeg,
  onSelect,
}: {
  events: MarketEvent[];
  activeNeg: string;
  onSelect: (id: string) => void;
}) {
  const race = deriveRace(events, activeNeg);
  if (!race) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-finn/25 bg-panel px-3 py-2">
      <span className="microlabel !text-finn">Race · {race.members.length} stores</span>
      <span className="h-px w-4 bg-line" />
      {race.members.map((m) => {
        const isActive = m.id === activeNeg;
        const won = race.settled && race.winnerId === m.id;
        const price = m.agreedPrice ?? m.lastPrice;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
              isActive
                ? 'border-finn/60 bg-finn-deep text-cream'
                : 'border-line-2 text-muted hover:border-faint hover:text-cream'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[m.status] ?? 'bg-faint'}`} />
            {m.sellerWarehouse}
            {price !== undefined && (
              <span className={`font-mono tabular-nums ${m.status === 'walked_away' ? 'text-faint line-through' : 'text-brass'}`}>
                £{price}
              </span>
            )}
            {won && <span className="text-deal">✓ won</span>}
            {m.needsAttention && (
              <span className="rounded-full border border-brass/50 bg-brass-deep px-1.5 text-[10px] text-brass">
                needs you
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
