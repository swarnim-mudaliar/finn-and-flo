'use client';

// Opt-in switch for multi-store racing. Only the switch itself toggles — the label sits
// beside it as plain text so nothing surprising happens on stray clicks.
export function RaceToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors ${
          value ? 'border-finn/60 bg-finn/80' : 'border-line-2 bg-panel-2'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
            value ? 'left-[18px] bg-night' : 'left-0.5 bg-faint'
          }`}
        />
      </button>
      <span className="text-[12px] leading-tight">
        <span className={value ? 'text-cream/90' : 'text-muted'}>Search across stores</span>{' '}
        <span className="text-faint">
          — Finn races up to 3 suppliers, each with its own Flo; you pick the winning deal
        </span>
      </span>
    </div>
  );
}
