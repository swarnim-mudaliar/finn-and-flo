'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'War room' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/how-it-works', label: 'How it works' },
];

export function Nav({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="flex items-end justify-between border-b border-line pb-4">
      <div className="flex items-end gap-8">
        <Link href="/" className="group leading-none">
          <span className="font-display text-[28px] font-semibold tracking-tight text-cream">
            Finn <em className="font-display italic text-brass">&amp;</em> Flo
          </span>
          <span className="microlabel mt-1.5 block group-hover:text-muted">
            The trading floor for secondhand wholesale
          </span>
        </Link>
        <nav className="flex gap-6 pb-0.5">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`border-b pb-1 text-[13px] transition-colors ${
                  active
                    ? 'border-brass font-medium text-cream'
                    : 'border-transparent text-muted hover:text-cream'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}
