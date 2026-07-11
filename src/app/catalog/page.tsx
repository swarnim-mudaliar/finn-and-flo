'use client';
import { useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import type { Item, OraclePrice } from '@/lib/types';

interface MarketInfo {
  items: Item[];
  oracle: Record<string, OraclePrice>;
}

const GRADE: Record<string, string> = {
  A: 'border-deal/40 text-deal',
  B: 'border-brass/40 text-brass',
  C: 'border-alarm/40 text-alarm',
};

export default function Catalog() {
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/market').then((r) => r.json()).then(setMarket);
  }, []);

  return (
    <main className="mx-auto max-w-[1700px] px-6 py-5">
      <Nav />
      <div className="mt-6 mb-5 flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl text-cream">The catalog</h1>
          <p className="mt-1 text-[13px] text-muted">
            Every item is one-of-a-kind — priced by the oracle against sold comps, with
            receipts. Click a card for the evidence.
          </p>
        </div>
        {market && (
          <div className="font-mono text-[12px] text-faint">
            {market.items.length} items ·{' '}
            <span className="text-brass">
              £{Math.round(market.items.reduce((s, i) => s + (market.oracle[i.id]?.estimate ?? 0), 0))}
            </span>{' '}
            total oracle value
          </div>
        )}
      </div>

      {!market ? (
        <div className="py-24 text-center text-faint">Loading catalog…</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {market.items.map((it) => {
            const o = market.oracle[it.id];
            const expanded = open === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setOpen(expanded ? null : it.id)}
                className={`rounded-2xl border bg-panel p-4 text-left transition-colors ${
                  expanded ? 'border-brass/50' : 'border-line hover:border-line-2'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display text-[15.5px] leading-snug text-cream">{it.title}</div>
                  <span
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${GRADE[it.conditionGrade]}`}
                  >
                    {it.conditionGrade}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-faint">
                  {it.brand} · {it.era} · {it.category}
                </div>
                {it.defects.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {it.defects.map((d, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-alarm/25 bg-alarm-deep/50 px-1.5 py-0.5 text-[10.5px] text-alarm/90"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-mono text-[22px] font-medium tabular-nums text-brass">
                    £{o?.estimate}
                  </span>
                  <span className="font-mono text-[11px] text-faint">
                    £{o?.low}–£{o?.high}
                  </span>
                </div>
                {expanded && o && (
                  <div className="mt-3 rounded-xl border border-line bg-night p-3">
                    <div className="microlabel mb-2">Oracle evidence</div>
                    <ul className="space-y-1.5">
                      {o.evidence.map((ev, i) => (
                        <li key={i} className="font-mono text-[11px] leading-relaxed text-muted">
                          <span className="text-brass/70">·</span> {ev}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
