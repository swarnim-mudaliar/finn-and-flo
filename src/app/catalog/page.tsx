'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Item, OraclePrice } from '@/lib/types';

interface MarketInfo {
  items: Item[];
  oracle: Record<string, OraclePrice>;
}

export default function Catalog() {
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/market').then((r) => r.json()).then(setMarket);
  }, []);

  if (!market) return <main className="p-8 text-zinc-500">Loading catalog…</main>;

  return (
    <main className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          Supplier catalog <span className="text-sm font-normal text-zinc-400">— every item priced by the oracle, with receipts</span>
        </h1>
        <Link href="/" className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">
          → War room
        </Link>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {market.items.map((it) => {
          const o = market.oracle[it.id];
          return (
            <button key={it.id} onClick={() => setOpen(open === it.id ? null : it.id)}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-left hover:border-zinc-600">
              <div className="text-sm font-semibold">{it.title}</div>
              <div className="text-xs text-zinc-400">{it.brand} · {it.era} · grade {it.conditionGrade}</div>
              {it.defects.length > 0 && (
                <div className="mt-1 text-xs text-amber-400">⚠ {it.defects.join('; ')}</div>
              )}
              <div className="mt-2 text-lg font-bold text-emerald-400">
                £{o?.estimate}
                <span className="ml-2 text-xs font-normal text-zinc-500">£{o?.low}–£{o?.high}</span>
              </div>
              {open === it.id && o && (
                <ul className="mt-2 space-y-1 border-t border-zinc-800 pt-2 text-xs text-zinc-400">
                  {o.evidence.map((ev, i) => <li key={i}>· {ev}</li>)}
                </ul>
              )}
            </button>
          );
        })}
      </div>
    </main>
  );
}
