'use client';
import { useState } from 'react';
import type { Side } from '@/lib/types';

const field =
  'w-full rounded-lg border border-line-2 bg-night px-3 py-2 text-[13px] text-cream placeholder:text-faint focus:border-brass/60 focus:outline-none';

export function MoveForm({ negotiationId, side }: { negotiationId: string; side: Side }) {
  const [action, setAction] = useState('counter');
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [bundle, setBundle] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(): Promise<void> {
    setError('');
    setSending(true);
    const bundleItemIds = bundle.trim()
      ? bundle.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        negotiationId,
        side,
        move: {
          action,
          price: price ? Number(price) : undefined,
          bundleItemIds,
          message: message || `${action} £${price}`,
          privateReasoning: reasoning.trim() || undefined,
        },
      }),
    });
    setSending(false);
    if (!res.ok) {
      setError((await res.json()).error ?? 'invalid move');
    } else {
      setMessage('');
      setReasoning('');
    }
  }

  return (
    <div className="space-y-2">
      <div className="microlabel !text-alarm">You hold the pen</div>
      <div className="flex gap-2">
        <select value={action} onChange={(e) => setAction(e.target.value)} className={field}>
          {['offer', 'counter', 'accept', 'reject', 'walk_away', 'invoke_mediator'].map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="£"
          type="number"
          className={`${field} !w-28 font-mono`}
        />
      </div>
      <input
        value={bundle}
        onChange={(e) => setBundle(e.target.value)}
        placeholder="Restructure bundle (item ids, comma-separated — blank keeps it)"
        className={`${field} font-mono !text-[12px]`}
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Say something to the other side…"
        className={field}
        rows={2}
      />
      <textarea
        value={reasoning}
        onChange={(e) => setReasoning(e.target.value)}
        placeholder="Private reasoning (only your side sees this)…"
        className={`${field} italic`}
        rows={1}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={sending}
          className="rounded-lg bg-brass px-4 py-2 text-[13px] font-semibold text-night transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {sending ? 'Sending…' : 'Send move'}
        </button>
        {error && <div className="text-[12px] text-flo">{error}</div>}
      </div>
    </div>
  );
}
