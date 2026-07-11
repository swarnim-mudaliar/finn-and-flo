'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PublicChat } from '@/components/PublicChat';
import { SidePane } from '@/components/SidePane';
import { useEvents } from '@/hooks/useEvents';
import type { Item, OraclePrice } from '@/lib/types';

interface MarketInfo {
  items: Item[];
  oracle: Record<string, OraclePrice>;
  buyers: { id: string; shopName: string }[];
  sellers: { id: string; warehouseName: string }[];
}

export default function Home() {
  const events = useEvents();
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [negId, setNegId] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch('/api/market').then((r) => r.json()).then(setMarket);
  }, []);

  const negotiationIds = useMemo(
    () => [...new Set(events.filter((e) => e.type === 'negotiation_created').map((e) => e.negotiationId))],
    [events]
  );
  const activeNeg = negId || negotiationIds[negotiationIds.length - 1] || '';

  const controls = useMemo(() => {
    const c = { buyer: false, seller: false };
    for (const e of events) {
      if (e.negotiationId !== activeNeg || e.type !== 'control_changed') continue;
      const p = e.payload as { side: 'buyer' | 'seller'; mode: string };
      c[p.side] = p.mode === 'human';
    }
    return c;
  }, [events, activeNeg]);

  const created = events.find((e) => e.negotiationId === activeNeg && e.type === 'negotiation_created');
  const principals = created
    ? (created.payload as { buyerShop: string; sellerWarehouse: string })
    : { buyerShop: '', sellerWarehouse: '' };

  async function start(): Promise<void> {
    if (!market) return;
    setStarting(true);
    const itemIds = market.items.slice(0, 5).map((i) => i.id);
    const res = await fetch('/api/negotiations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ buyerId: market.buyers[0].id, sellerId: market.sellers[0].id, itemIds }),
    });
    const { id } = await res.json();
    setNegId(id);
    setStarting(false);
  }

  async function replay(): Promise<void> {
    if (!activeNeg) return;
    const res = await fetch('/api/replay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ negotiationId: activeNeg }),
    });
    const { replayId } = await res.json();
    if (replayId) setNegId(replayId);
  }

  return (
    <main className="flex h-screen flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          <span className="text-sky-400">Finn</span> &amp; <span className="text-pink-400">Flo</span>
          <span className="ml-3 text-sm font-normal text-zinc-400">personal agents for secondhand wholesale</span>
        </h1>
        <div className="flex items-center gap-2">
          <select value={activeNeg} onChange={(e) => setNegId(e.target.value)}
            className="rounded bg-zinc-800 p-2 text-sm">
            {negotiationIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <button onClick={replay} disabled={!activeNeg}
            className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40">
            Replay
          </button>
          <button onClick={start} disabled={starting || !market}
            className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-40">
            {starting ? 'Starting…' : 'New negotiation'}
          </button>
          <Link href="/catalog" className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">Catalog</Link>
        </div>
      </header>
      {activeNeg ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
          <SidePane side="seller" negotiationId={activeNeg} events={events}
            humanControlled={controls.seller} principal={principals.sellerWarehouse} />
          <PublicChat negotiationId={activeNeg} events={events} />
          <SidePane side="buyer" negotiationId={activeNeg} events={events}
            humanControlled={controls.buyer} principal={principals.buyerShop} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-zinc-500">
          Start a negotiation to watch Finn &amp; Flo work.
        </div>
      )}
    </main>
  );
}
