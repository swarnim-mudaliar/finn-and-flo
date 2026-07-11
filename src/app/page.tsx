'use client';
import { useEffect, useMemo, useState } from 'react';
import { Nav } from '@/components/Nav';
import { PublicChat } from '@/components/PublicChat';
import { SidePane } from '@/components/SidePane';
import { useEvents } from '@/hooks/useEvents';
import type { Item, OraclePrice, Side } from '@/lib/types';

interface MarketInfo {
  items: Item[];
  oracle: Record<string, OraclePrice>;
  buyers: { id: string; shopName: string }[];
  sellers: { id: string; warehouseName: string }[];
}

const TERMINAL = new Set(['deal', 'walked_away', 'mediated_deal', 'mediation_no_deal']);

export default function Home() {
  // Judge mode: /?side=seller renders ONLY that side's pane and opens a server-scoped
  // SSE stream — the opposing side's private events never even reach this browser.
  // Hand the judge this URL for the takeover beat; Finn's max stays off their screen.
  const [scope, setScope] = useState<'buyer' | 'seller' | undefined>(undefined);
  const [scopeReady, setScopeReady] = useState(false);
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('side');
    if (s === 'buyer' || s === 'seller') setScope(s);
    setScopeReady(true);
  }, []);
  return scopeReady ? <WarRoom scope={scope} /> : null;
}

function WarRoom({ scope }: { scope?: 'buyer' | 'seller' }) {
  const events = useEvents(scope);
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

  // Whose turn is it? Buyer opens; every public move flips the turn. Drives the
  // "X is thinking…" indicator while an agent's LLM call is in flight.
  const { turn, terminal } = useMemo(() => {
    const mine = events.filter((e) => e.negotiationId === activeNeg);
    const isTerminal = mine.some(
      (e) => e.type === 'status' && TERMINAL.has((e.payload as { status: string }).status)
    );
    const moves = mine.filter((e) => e.type === 'move').length;
    const t: Side = moves % 2 === 0 ? 'buyer' : 'seller';
    return { turn: t, terminal: isTerminal };
  }, [events, activeNeg]);

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

  const ghostBtn =
    'rounded-full border border-line-2 px-4 py-2 text-[13px] text-muted transition-colors hover:border-faint hover:text-cream disabled:opacity-40 disabled:hover:border-line-2 disabled:hover:text-muted';

  return (
    <main className="mx-auto flex h-screen max-w-[1700px] flex-col gap-4 px-6 py-5">
      <Nav
        right={
          <>
            <select
              value={activeNeg}
              onChange={(e) => setNegId(e.target.value)}
              className="max-w-[220px] rounded-full border border-line-2 bg-panel px-3 py-2 font-mono text-[11px] text-muted focus:border-brass/60 focus:outline-none"
            >
              {negotiationIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button onClick={replay} disabled={!activeNeg} className={ghostBtn}>
              Replay
            </button>
            {!scope && (
              <button
                onClick={start}
                disabled={starting || !market}
                className="rounded-full bg-flo px-5 py-2 text-[13px] font-semibold text-night transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {starting ? 'Starting…' : 'New negotiation'}
              </button>
            )}
          </>
        }
      />

      {scope && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-alarm/30 bg-alarm-deep/50 py-2 text-[12px] text-alarm">
          Judge mode — you see only the <span className="font-semibold uppercase">{scope}</span> side.
          The other side&apos;s private reasoning never reaches this browser.
        </div>
      )}

      {activeNeg ? (
        <div className={`grid min-h-0 flex-1 gap-4 ${scope ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {(!scope || scope === 'seller') && (
            <SidePane
              side="seller"
              negotiationId={activeNeg}
              events={events}
              humanControlled={controls.seller}
              principal={principals.sellerWarehouse}
              thinking={!terminal && turn === 'seller' && !controls.seller}
            />
          )}
          <PublicChat negotiationId={activeNeg} events={events} />
          {(!scope || scope === 'buyer') && (
            <SidePane
              side="buyer"
              negotiationId={activeNeg}
              events={events}
              humanControlled={controls.buyer}
              principal={principals.buyerShop}
              thinking={!terminal && turn === 'buyer' && !controls.buyer}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="font-display text-3xl text-cream/90">
            Two agents. <em className="text-flo">Opposing interests.</em> One deal.
          </div>
          <p className="max-w-md text-center text-[14px] leading-relaxed text-muted">
            Flo sells for the supplier. Finn buys for the reseller. Start a negotiation and
            watch them work — or take a side over and try to beat them yourself.
          </p>
          <button
            onClick={start}
            disabled={starting || !market}
            className="mt-2 rounded-full bg-flo px-6 py-2.5 text-[14px] font-semibold text-night transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {starting ? 'Starting…' : 'Start a negotiation'}
          </button>
        </div>
      )}
    </main>
  );
}
