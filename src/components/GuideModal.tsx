'use client';
import { useCallback, useEffect, useState } from 'react';

const SEEN_KEY = 'ff-guide-dismissed';

function Step({
  n,
  color,
  title,
  detail,
}: {
  n: string;
  color: string;
  title: React.ReactNode;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel-2 p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[15px] italic ${color}`}
        >
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-snug text-cream">{title}</div>
          <details className="group mt-1.5">
            <summary className="cursor-pointer list-none text-[12px] text-faint transition-colors hover:text-muted">
              <span className="group-open:hidden">more ▾</span>
              <span className="hidden group-open:inline">less ▴</span>
            </summary>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{detail}</p>
          </details>
        </div>
      </div>
    </div>
  );
}

export function GuideModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
  }, []);

  const close = useCallback(() => {
    localStorage.setItem(SEEN_KEY, '1');
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="How to use this"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line-2 font-display text-[15px] italic text-muted transition-colors hover:border-faint hover:text-cream"
      >
        ?
      </button>

      {open && (
        <div
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/85 p-6 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-rise w-full max-w-xl rounded-3xl border border-line bg-panel p-7 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl text-cream">
                  Agents haggle. <em className="text-flo">You decide.</em>
                </h2>
                <p className="mt-1 text-[13px] text-muted">Thirty seconds to learn, honestly.</p>
              </div>
              <button
                onClick={close}
                aria-label="Close guide"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line-2 text-lg text-muted transition-colors hover:border-faint hover:text-cream"
              >
                ×
              </button>
            </div>

            <div className="space-y-2.5">
              <Step
                n="1"
                color="bg-finn-deep text-finn"
                title={
                  <>
                    Brief <span className="text-finn">Finn</span>. &quot;Workwear, £150 max.&quot;
                    That&apos;s it.
                  </>
                }
                detail="Mention a spend ceiling and it's enforced in code — Finn literally cannot exceed it, no matter what anyone says to him."
              />
              <Step
                n="2"
                color="bg-finn-deep text-finn"
                title="He scouts every supplier — and picks the best one."
                detail="Four warehouses, one-of-a-kind items, every price grounded in sold comps by a pricing oracle. His scout report shows his reasoning."
              />
              <Step
                n="3"
                color="bg-flo-deep text-flo"
                title={
                  <>
                    Watch the haggle, live. <span className="text-flo">Flo</span> sells hard.
                  </>
                }
                detail="The middle column is what both agents say. The side panes are what each is privately thinking — including Flo plotting her upsell. Hit “Take over” to haggle yourself."
              />
              <Step
                n="4"
                color="bg-deal-deep text-deal"
                title="You sign every deal — or send it back."
                detail="Agents only shake hands. A deal closes when both owners approve. Send it back with a note and watch your agent rework the terms."
              />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span className="text-[12px] text-faint">Built in a day · Fleek × a16z hackathon</span>
              <button
                onClick={close}
                className="rounded-full bg-flo px-6 py-2.5 text-[14px] font-semibold text-night transition-opacity hover:opacity-90"
              >
                Let&apos;s go
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
