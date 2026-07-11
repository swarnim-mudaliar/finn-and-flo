'use client';
import { useEffect, useMemo, useState } from 'react';
import { Nav } from '@/components/Nav';
import { PublicChat } from '@/components/PublicChat';
import { RaceStrip } from '@/components/RaceStrip';
import { RaceToggle } from '@/components/RaceToggle';
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
  const [initialNeg, setInitialNeg] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('side');
    if (s === 'buyer' || s === 'seller') setScope(s);
    setInitialNeg(params.get('n') ?? '');
    setScopeReady(true);
  }, []);
  return scopeReady ? <WarRoom scope={scope} initialNeg={initialNeg} /> : null;
}

function WarRoom({ scope, initialNeg }: { scope?: 'buyer' | 'seller'; initialNeg?: string }) {
  const events = useEvents(scope);
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [negId, setNegId] = useState(initialNeg ?? '');
  const [starting, setStarting] = useState(false);
  const [brief, setBrief] = useState('');
  const [race, setRace] = useState(false);

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

  // Whose turn is it, and what state is the negotiation in? Status events carry the
  // authoritative turn (owners can reopen negotiations, which breaks move-parity);
  // moves after the last status event flip it. Drives the "X is thinking…" indicator.
  const { turn, status } = useMemo(() => {
    const mine = events.filter((e) => e.negotiationId === activeNeg);
    const statusEvents = mine.filter((e) => e.type === 'status');
    const last = statusEvents[statusEvents.length - 1];
    const st = ((last?.payload as { status?: string } | undefined)?.status ?? 'active') as string;
    const baseTurn = (((last?.payload as { turn?: Side } | undefined)?.turn ?? 'buyer') as Side) || 'buyer';
    const baseSeq = last?.seq ?? 0;
    const movesAfter = mine.filter((e) => e.type === 'move' && e.seq > baseSeq).length;
    const t: Side =
      movesAfter % 2 === 0 ? baseTurn : baseTurn === 'buyer' ? 'seller' : 'buyer';
    return { turn: t, status: st };
  }, [events, activeNeg]);

  // Paused while the buyer's owner decides on a ceiling raise?
  const awaitingCap = useMemo(() => {
    const mine = events.filter((e) => e.negotiationId === activeNeg);
    const reqs = mine.filter((e) => e.type === 'cap_raise_requested').length;
    const decs = mine.filter((e) => e.type === 'cap_decision').length;
    if (reqs > decs) return true;
    // Finn said no (scout verdict short of 'good'): paused on the owner's pursue/close call.
    const scoutRep = [...mine].reverse().find((e) => e.type === 'scout_report');
    return (
      scoutRep !== undefined &&
      ((scoutRep.payload as { matchQuality?: string }).matchQuality ?? 'good') !== 'good' &&
      !mine.some((e) => e.type === 'scout_decision') &&
      !mine.some((e) => e.type === 'negotiation_created')
    );
  }, [events, activeNeg]);
  void TERMINAL; // membership retained for readers; status string drives the UI now

  async function start(): Promise<void> {
    if (!market) return;
    setStarting(true);
    const sellerId = market.sellers[0].id;
    // A negotiation is with a single supplier — quick-start from that supplier's own stock.
    const itemIds = market.items
      .filter((i) => i.sellerId === sellerId)
      .slice(0, 5)
      .map((i) => i.id);
    const res = await fetch('/api/negotiations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ buyerId: market.buyers[0].id, sellerId, itemIds }),
    });
    const { id } = await res.json();
    setNegId(id);
    setStarting(false);
  }

  async function submitBrief(): Promise<void> {
    if (!market || !brief.trim()) return;
    setStarting(true);
    const res = await fetch('/api/brief', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ buyerId: market.buyers[0].id, brief, race }),
    });
    const { id } = await res.json();
    if (id) setNegId(id);
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
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {scope !== 'seller' && (
            <RaceStrip events={events} activeNeg={activeNeg} onSelect={setNegId} />
          )}
          <div className={`grid min-h-0 flex-1 gap-4 ${scope ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {(!scope || scope === 'seller') && (
              <SidePane
                side="seller"
                negotiationId={activeNeg}
                events={events}
                humanControlled={controls.seller}
                principal={principals.sellerWarehouse}
                thinking={status === 'active' && !awaitingCap && turn === 'seller' && !controls.seller}
              />
            )}
            <PublicChat negotiationId={activeNeg} events={events} market={market} />
            {(!scope || scope === 'buyer') && (
              <SidePane
                side="buyer"
                negotiationId={activeNeg}
                events={events}
                humanControlled={controls.buyer}
                principal={principals.buyerShop}
                thinking={status === 'active' && !awaitingCap && turn === 'buyer' && !controls.buyer}
                market={market}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="font-display text-3xl text-cream/90">
            Two agents. <em className="text-flo">Opposing interests.</em> One deal.
          </div>
          <p className="max-w-md text-center text-[14px] leading-relaxed text-muted">
            Tell <span className="text-finn">Finn</span> what you&apos;re hunting for. He scouts
            the catalog, picks the bundle, and haggles with{' '}
            <span className="text-flo">Flo</span> — who will absolutely try to upsell him.
          </p>
          <div className="mt-3 w-full max-w-xl rounded-2xl border border-finn/25 bg-panel p-4">
            <div className="microlabel mb-2 !text-finn">Brief your agent</div>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={'e.g. "I need workwear jackets my Brighton shop can flip fast — £150 max, nothing with bad stains."'}
              rows={3}
              className="w-full rounded-xl border border-line-2 bg-night px-3 py-2.5 text-[14px] text-cream placeholder:text-faint focus:border-finn/50 focus:outline-none"
            />
            <div className="mt-3">
              <RaceToggle value={race} onChange={setRace} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={start}
                disabled={starting || !market}
                className="text-[12px] text-faint underline-offset-4 hover:text-muted hover:underline disabled:opacity-40"
              >
                or skip the brief — quick-start a negotiation
              </button>
              <button
                onClick={submitBrief}
                disabled={starting || !market || !brief.trim()}
                className="rounded-full bg-finn px-6 py-2.5 text-[14px] font-semibold text-night transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {starting ? 'Briefing Finn…' : 'Send Finn to work'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
