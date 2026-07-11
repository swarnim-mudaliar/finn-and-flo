'use client';
import { useState } from 'react';
import type { Side } from '@/lib/types';

export function MoveForm({ negotiationId, side }: { negotiationId: string; side: Side }) {
  const [action, setAction] = useState('counter');
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(): Promise<void> {
    setError('');
    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        negotiationId,
        side,
        move: { action, price: price ? Number(price) : undefined, message: message || `${action} £${price}` },
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? 'invalid move');
    } else {
      setMessage('');
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-400">You are in control</div>
      <div className="flex gap-2">
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded bg-zinc-800 p-2 text-sm">
          {['offer', 'counter', 'accept', 'reject', 'walk_away', 'invoke_mediator'].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="£" type="number"
          className="w-24 rounded bg-zinc-800 p-2 text-sm" />
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Say something…"
        className="w-full rounded bg-zinc-800 p-2 text-sm" rows={2} />
      <button onClick={submit} className="rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-black">
        Send move
      </button>
      {error && <div className="text-sm text-red-400">{error}</div>}
    </div>
  );
}
