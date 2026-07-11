'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/Nav';

interface MarketInfo {
  buyers: { id: string; shopName: string; persona: string }[];
}

const EXAMPLES = [
  'I need hard-wearing workwear my shop can flip fast — Carhartt, Dickies, Barbour. £150 max all-in, nothing with bad stains.',
  'Y2K graphic tees and vintage sportswear for a Depop store — £80 ceiling, grade A/B only.',
  'Build me a coherent “90s Americana” rail: denim, flannel, boots. Around £200, defects fine if the price reflects them.',
];

export default function Home() {
  const router = useRouter();
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [buyerId, setBuyerId] = useState('');
  const [brief, setBrief] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch('/api/market')
      .then((r) => r.json())
      .then((m: MarketInfo) => {
        setMarket(m);
        setBuyerId(m.buyers[0]?.id ?? '');
      });
  }, []);

  async function send(): Promise<void> {
    if (!brief.trim() || !buyerId) return;
    setSending(true);
    const res = await fetch('/api/brief', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ buyerId, brief }),
    });
    const { id, error } = await res.json();
    setSending(false);
    if (id) router.push(`/war-room?n=${id}`);
    else alert(error ?? 'something went wrong');
  }

  const select =
    'w-full rounded-xl border border-line-2 bg-night px-3 py-2.5 text-[13.5px] text-cream focus:border-finn/50 focus:outline-none';

  return (
    <main className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 py-5">
      <Nav />

      <div className="flex flex-1 flex-col items-center justify-center py-10">
        <h1 className="text-center font-display text-[44px] leading-tight text-cream">
          Don&apos;t haggle. <em className="text-flo">Brief your agent.</em>
        </h1>
        <p className="mt-4 max-w-xl text-center text-[15px] leading-relaxed text-muted">
          Tell <span className="text-finn">Finn</span> what your shop is hunting for. He scouts
          every supplier&apos;s stock, picks the supplier and the bundle, and negotiates with{' '}
          <span className="text-flo">Flo</span> — the supplier&apos;s agent, who will absolutely
          try to upsell him. You only make the final calls.
        </p>

        <div className="mt-8 w-full max-w-2xl rounded-2xl border border-finn/25 bg-panel p-5">
          <div className="microlabel mb-3 !text-finn">Your brief to Finn</div>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={`e.g. "${EXAMPLES[0]}"`}
            rows={4}
            className="w-full rounded-xl border border-line-2 bg-night px-4 py-3 text-[15px] leading-relaxed text-cream placeholder:text-faint focus:border-finn/50 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setBrief(ex)}
                className="rounded-full border border-line-2 px-3 py-1 text-[11px] text-faint transition-colors hover:border-faint hover:text-muted"
              >
                {ex.slice(0, 44)}…
              </button>
            ))}
          </div>

          <div className="mt-4">
            <div className="microlabel mb-1.5">Buying for</div>
            <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)} className={select}>
              {market?.buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shopName}
                </option>
              ))}
            </select>
            <div className="mt-1.5 text-[11px] text-faint">
              Finn scouts every supplier&apos;s stock and picks the supplier himself.
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div className="text-[12px] text-faint">
              Mention a spend ceiling and it&apos;s{' '}
              <span className="text-muted">enforced in code</span> — Finn can&apos;t exceed it.
            </div>
            <button
              onClick={send}
              disabled={sending || !brief.trim() || !market}
              className="rounded-full bg-finn px-7 py-2.5 text-[14px] font-semibold text-night transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {sending ? 'Briefing Finn…' : 'Send Finn to work'}
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-5 text-[13px] text-faint">
          <Link href="/war-room" className="underline-offset-4 hover:text-muted hover:underline">
            Or watch the war room — negotiations already on the floor
          </Link>
          <span className="text-line-2">·</span>
          <Link href="/how-it-works" className="underline-offset-4 hover:text-muted hover:underline">
            How it works
          </Link>
        </div>
      </div>
    </main>
  );
}
