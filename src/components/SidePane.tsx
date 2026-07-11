'use client';
import { useEffect, useRef, useState } from 'react';
import type { MarketEvent, Side } from '@/lib/types';
import { MoveForm } from './MoveForm';

async function post(url: string, body: Record<string, unknown>): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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
  const all = events.filter((e) => e.negotiationId === negotiationId);
  const mine = all.filter((e) => e.visibility === vis);
  const scroller = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState('');

  // Owner-decision state, derived from the stream.
  const statusEvents = all.filter((e) => e.type === 'status');
  const lastStatusEvent = statusEvents[statusEvents.length - 1];
  const lastStatus = ((lastStatusEvent?.payload as { status?: string })?.status ?? 'active') as string;
  const pendingPrice = (lastStatusEvent?.payload as { agreedPrice?: number })?.agreedPrice;
  const lastPendingSeq =
    [...statusEvents].reverse().find((s) => (s.payload as { status: string }).status === 'pending_approval')
      ?.seq ?? Infinity;
  const myDecisionMade = all.some(
    (e) =>
      e.type === 'approval_decision' &&
      e.seq > lastPendingSeq &&
      (e.payload as { side: string }).side === side
  );
  const capReq = [...all].reverse().find((e) => e.type === 'cap_raise_requested');
  const capOpen =
    side === 'buyer' && capReq !== undefined && !all.some((e) => e.type === 'cap_decision' && e.seq > capReq.seq);
  const myConsentGiven = all.some(
    (e) => e.type === 'mediation_consent' && (e.payload as { side: string }).side === side
  );
  const suggestedCap = capOpen ? ((capReq!.payload as { suggestedCap: number }).suggestedCap ?? 0) : 0;
  const [capValue, setCapValue] = useState('');
  useEffect(() => {
    if (capOpen) setCapValue(String(suggestedCap));
  }, [capOpen, suggestedCap]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [mine.length, thinking, lastStatus, capOpen]);

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
          e.type === 'brief_submitted' ? (
            <div key={e.seq} className="animate-rise rounded-xl border border-finn/30 bg-finn-deep p-3">
              <div className="microlabel mb-1 !text-finn">Your brief to Finn</div>
              <div className="text-[13px] leading-relaxed text-cream/85">
                &quot;{e.payload.text as string}&quot;
              </div>
            </div>
          ) : e.type === 'scout_report' ? (
            <div key={e.seq} className={`animate-rise rounded-xl border ${meta.border} bg-panel-2 p-3`}>
              <div className="microlabel mb-1">Scout report · {(e.payload.itemIds as string[])?.length} items picked</div>
              <div className="font-display text-[13px] leading-relaxed italic text-cream/80">
                {e.payload.rationale as string}
              </div>
              <div className="mt-2 border-t border-line pt-2 text-[12px] text-muted">
                <span className="text-cream/70">Opening plan:</span> {e.payload.openingPlan as string}
                {e.payload.briefBudgetMax !== undefined && (
                  <span className="mt-1 block font-mono text-[11px] text-alarm">
                    ceiling £{e.payload.briefBudgetMax as number} — enforced in code
                  </span>
                )}
              </div>
            </div>
          ) : e.type === 'scout_failed' ? (
            <div key={e.seq} className="animate-rise rounded-xl border border-alarm/40 bg-alarm-deep p-3 text-[13px] text-alarm">
              {e.payload.text as string}
            </div>
          ) : e.type === 'mediation_sealed' ? (
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

      {lastStatus === 'pending_approval' && !myDecisionMade && (
        <div className="border-t border-deal/30 bg-deal-deep/40 p-3">
          <div className="microlabel mb-2 !text-deal">
            Your call — {meta.name} shook on £{pendingPrice}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note if sending back (optional)…"
            className="mb-2 w-full rounded-lg border border-line-2 bg-night px-3 py-2 text-[12.5px] text-cream placeholder:text-faint focus:border-deal/50 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => post('/api/approve', { negotiationId, side, approve: true })}
              className="flex-1 rounded-lg bg-deal px-3 py-2 text-[13px] font-semibold text-night hover:opacity-90"
            >
              Approve deal
            </button>
            <button
              onClick={() => {
                void post('/api/approve', { negotiationId, side, approve: false, note: note || undefined });
                setNote('');
              }}
              className="flex-1 rounded-lg border border-line-2 px-3 py-2 text-[13px] text-muted hover:border-faint hover:text-cream"
            >
              Send back
            </button>
          </div>
        </div>
      )}

      {capOpen && (
        <div className="border-t border-brass/30 bg-brass-deep/40 p-3">
          <div className="microlabel mb-1 !text-brass">Finn needs a decision</div>
          <div className="mb-2 text-[12.5px] leading-relaxed text-cream/80">
            Flo added {(capReq!.payload as { addedItemIds: string[] }).addedItemIds.length} item(s) —
            new bundle is worth ~£{(capReq!.payload as { newBundleOracle: number }).newBundleOracle} resale.
            Your ceiling is £{(capReq!.payload as { currentCap: number }).currentCap}. Raise it?
          </div>
          <div className="flex gap-2">
            <input
              value={capValue}
              onChange={(e) => setCapValue(e.target.value)}
              type="number"
              className="w-24 rounded-lg border border-line-2 bg-night px-3 py-2 font-mono text-[13px] text-cream focus:border-brass/60 focus:outline-none"
            />
            <button
              onClick={() => post('/api/cap', { negotiationId, newCap: Number(capValue) })}
              className="flex-1 rounded-lg bg-brass px-3 py-2 text-[13px] font-semibold text-night hover:opacity-90"
            >
              Set new ceiling
            </button>
            <button
              onClick={() => post('/api/cap', { negotiationId, newCap: null })}
              className="flex-1 rounded-lg border border-line-2 px-3 py-2 text-[13px] text-muted hover:border-faint hover:text-cream"
            >
              Keep £{(capReq!.payload as { currentCap: number }).currentCap}
            </button>
          </div>
        </div>
      )}

      {lastStatus === 'escalated' && !myConsentGiven && (
        <div className="border-t border-seal/30 bg-seal-deep/40 p-3">
          <div className="microlabel mb-1 !text-seal">Back in your hands</div>
          <div className="mb-2 text-[12.5px] leading-relaxed text-cream/80">
            The agents couldn&apos;t close. Consent to sealed-bid mediation, or take over and
            finish it yourself.
          </div>
          <button
            onClick={() => post('/api/consent', { negotiationId, side })}
            className="w-full rounded-lg bg-seal px-3 py-2 text-[13px] font-semibold text-night hover:opacity-90"
          >
            Consent to mediation
          </button>
        </div>
      )}

      {humanControlled && (
        <div className="border-t border-line p-3">
          <MoveForm negotiationId={negotiationId} side={side} />
        </div>
      )}
    </div>
  );
}
