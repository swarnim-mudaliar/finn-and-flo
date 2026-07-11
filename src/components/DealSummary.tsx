'use client';
import type { Item } from '@/lib/types';
import type { DealSummaryData, TrajectoryPoint } from '@/lib/summary';

// One glance = the whole negotiation: how the prices converged, what the bundle became,
// what the deal is worth against the oracle, and who signed. Judges skim — everything
// above the fold is chips and mono numbers; prose lives behind the details toggle.

function Sparkline({ points }: { points: TrajectoryPoint[] }) {
  if (points.length < 2) return null;
  const W = 560;
  const H = 84;
  const PADX = 30;
  const PADY = 22;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const x = (i: number) => PADX + (i * (W - 2 * PADX)) / (points.length - 1);
  const y = (price: number) => H - PADY - ((price - min) * (H - 2 * PADY)) / span;
  const color = (p: TrajectoryPoint) =>
    p.kind !== 'offer' ? 'var(--color-deal)' : p.side === 'buyer' ? 'var(--color-finn)' : 'var(--color-flo)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="price trajectory">
      <polyline
        points={points.map((p, i) => `${x(i)},${y(p.price)}`).join(' ')}
        fill="none"
        stroke="var(--color-line-2)"
        strokeWidth="1.25"
      />
      {points.map((p, i) => {
        const settle = p.kind !== 'offer';
        // Sellers ask high, buyers bid low: labels above seller dots and below buyer
        // dots naturally clear the line between them.
        const labelAbove = p.side === 'seller' || settle;
        return (
          <g key={p.seq}>
            {p.bundleChanged && (
              <circle cx={x(i)} cy={y(p.price)} r={7} fill="none" stroke="var(--color-brass)" strokeWidth="1.25" strokeDasharray="2.5 2" />
            )}
            <circle cx={x(i)} cy={y(p.price)} r={settle ? 4.5 : 3} fill={color(p)} />
            <text
              x={x(i)}
              y={labelAbove ? y(p.price) - (p.bundleChanged ? 11 : 8) : y(p.price) + 15}
              textAnchor="middle"
              fill={settle ? 'var(--color-deal)' : 'var(--color-muted)'}
              style={{ font: `${settle ? 600 : 400} 10.5px var(--font-jetbrains)` }}
            >
              {p.kind === 'mediation' ? `⚖${p.price}` : p.price}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const OUTCOME_META: Record<
  DealSummaryData['outcome'],
  { label: string; cls: string; showPrice: boolean }
> = {
  deal: { label: 'deal', cls: 'border-deal/40 bg-deal-deep text-deal', showPrice: true },
  mediated_deal: { label: '⚖ mediated deal', cls: 'border-deal/40 bg-deal-deep text-deal', showPrice: true },
  walked_away: { label: 'walked away', cls: 'border-line-2 bg-panel text-muted', showPrice: false },
  mediation_no_deal: { label: '⚖ no deal', cls: 'border-seal/40 bg-seal-deep text-seal', showPrice: false },
  // Shown from the handshake: the digest the owners read BEFORE signing.
  pending_approval: {
    label: '🤝 handshake — provisional',
    cls: 'border-dashed border-deal/50 bg-deal-deep/50 text-deal',
    showPrice: true,
  },
  // A send-back reopened the floor; the summary stays up as a live scoreboard.
  reopened: {
    label: '↩ reopened — back on the floor',
    cls: 'border-dashed border-alarm/50 bg-alarm-deep/50 text-alarm',
    showPrice: false,
  },
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-1.5">
      <span className="microlabel mr-2">{label}</span>
      <span className={`font-mono text-[13px] font-medium tabular-nums ${tone ?? 'text-cream/90'}`}>{value}</span>
    </div>
  );
}

export function DealSummary({ data, items }: { data: DealSummaryData; items: Map<string, Item> }) {
  const meta = OUTCOME_META[data.outcome];
  const pct =
    data.finalPrice !== undefined && data.finalOracle > 0
      ? Math.round((data.finalPrice / data.finalOracle) * 100)
      : undefined;
  const lastBid = [...data.trajectory].reverse().find((p) => p.kind === 'offer' && p.side === 'buyer');
  const lastAsk = [...data.trajectory].reverse().find((p) => p.kind === 'offer' && p.side === 'seller');
  const notes = data.finalApprovals.filter((a) => a.note);

  return (
    <div className="animate-rise mx-auto w-full rounded-2xl border border-line-2 bg-panel-2 p-4">
      <div className="flex items-center gap-2">
        <span className="microlabel">deal summary</span>
        <span className="h-px flex-1 bg-line" />
        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${meta.cls}`}>
          {meta.label}
          {meta.showPrice && data.finalPrice !== undefined && (
            <span className="ml-1.5 font-mono tabular-nums normal-case">£{data.finalPrice}</span>
          )}
        </span>
      </div>

      <Sparkline points={data.trajectory} />

      <div className="flex flex-wrap gap-2">
        {data.finalPrice !== undefined ? (
          <>
            <Stat label="final" value={`£${data.finalPrice}`} tone="text-deal" />
            <Stat label="oracle resale" value={`£${data.finalOracle}`} tone="text-brass" />
            {pct !== undefined && <Stat label="paid" value={`${pct}% of resale`} />}
          </>
        ) : (
          <>
            {lastAsk && <Stat label="last ask" value={`£${lastAsk.price}`} tone="text-flo" />}
            {lastBid && <Stat label="last bid" value={`£${lastBid.price}`} tone="text-finn" />}
            {lastAsk && lastBid && <Stat label="gap" value={`£${Math.abs(lastAsk.price - lastBid.price)}`} />}
          </>
        )}
        <Stat label="rounds" value={String(data.rounds)} />
        <Stat
          label="bundle"
          value={
            data.openingItemIds.length === data.finalItemIds.length
              ? `${data.finalItemIds.length} items`
              : `${data.openingItemIds.length}→${data.finalItemIds.length} items`
          }
        />
      </div>

      <div className="mt-2.5 space-y-1 text-[12px] leading-relaxed">
        {data.changes.map((c) => {
          const upsell = c.added.length > 0 && c.dropped.length === 0;
          const parts = [];
          if (c.added.length) parts.push(`+${c.added.length}`);
          if (c.dropped.length) parts.push(`−${c.dropped.length}`);
          return (
            <div key={c.seq} className={upsell ? 'text-deal/90' : 'text-brass/90'}>
              {upsell ? '✚' : '✂'} {c.side === 'seller' ? 'Flo' : 'Finn'}{' '}
              {upsell ? 'upsold' : 'restructured'} {parts.join(', ')} ·{' '}
              <span className="font-mono tabular-nums">
                {c.fromCount}→{c.toCount} items · oracle £{c.fromOracle}→£{c.toOracle}
              </span>{' '}
              · {c.keptInFinal ? 'kept in the final bundle' : 'later reverted'}
            </div>
          );
        })}
        {data.mediated && (
          <div className="text-seal/90">
            ⚖ sealed-bid mediation (Chatterjee–Samuelson) — both sides consented, limits stayed
            sealed{data.outcome === 'mediation_no_deal'
              ? ', no overlap existed — no deal was possible'
              : `, cleared at the midpoint £${data.finalPrice}`}
          </div>
        )}
        {data.outcome === 'pending_approval' ? (
          <div>
            {(['seller', 'buyer'] as const).map((side) => {
              const waiting = data.awaiting.includes(side);
              const decision = data.finalApprovals.find((a) => a.side === side);
              const who = side === 'buyer' ? "Finn's owner" : "Flo's owner";
              return (
                <span key={side} className={`mr-3 ${waiting ? 'text-muted' : 'text-deal/90'}`}>
                  {waiting ? `⧖ awaiting ${who}` : `✓ ${who}${decision?.auto ? ' (AI)' : ''}`}
                </span>
              );
            })}
            {data.sendBacks > 0 && <span className="text-muted">· sent back ×{data.sendBacks}</span>}
          </div>
        ) : (
          data.finalApprovals.length > 0 && (
            <div>
              {data.finalApprovals.map((a) => (
                <span key={a.side} className={`mr-3 ${a.approved ? 'text-deal/90' : 'text-alarm'}`}>
                  {a.approved ? '✓' : '✗'} {a.side === 'buyer' ? "Finn's owner" : "Flo's owner"}
                  {a.auto ? ' (AI)' : ''}
                </span>
              ))}
              {data.sendBacks > 0 && (
                <span className="text-muted">· sent back ×{data.sendBacks} before closing</span>
              )}
            </div>
          )
        )}
      </div>

      <details className="group mt-2.5 border-t border-line pt-2">
        <summary className="cursor-pointer list-none text-[12px] text-faint transition-colors hover:text-muted">
          <span className="group-open:hidden">final bundle & owner notes ▾</span>
          <span className="hidden group-open:inline">less ▴</span>
        </summary>
        <div className="mt-2 space-y-1">
          {data.finalItemIds.map((id) => {
            const it = items.get(id);
            const addedLater = !data.openingItemIds.includes(id);
            return (
              <div key={id} className="flex items-baseline gap-2 text-[12px]">
                <span className="text-cream/80">{it ? it.title : id}</span>
                {it && <span className="text-faint">grade {it.conditionGrade}</span>}
                {addedLater && <span className="text-deal/80">✚ upsold in</span>}
              </div>
            );
          })}
          {notes.map((a) => (
            <div key={a.side} className="pt-1 text-[12px] text-muted">
              {a.side === 'buyer' ? "Finn's owner" : "Flo's owner"}
              {a.auto ? ' (AI)' : ''}: “{a.note}”
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
