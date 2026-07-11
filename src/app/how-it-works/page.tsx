import { Nav } from '@/components/Nav';

function Act({
  n,
  title,
  children,
}: {
  n: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-[64px_1fr] gap-6">
      <div className="pt-1 text-right font-display text-3xl italic text-faint">{n}</div>
      <div className="border-l border-line pb-10 pl-6">
        <h2 className="font-display text-xl text-cream">{title}</h2>
        <div className="mt-3 max-w-2xl space-y-2 text-[14px] leading-relaxed text-muted">
          {children}
        </div>
      </div>
    </section>
  );
}

function More({ children }: { children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[12px] text-faint transition-colors hover:text-muted">
        <span className="group-open:hidden">details ▾</span>
        <span className="hidden group-open:inline">less ▴</span>
      </summary>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed">{children}</div>
    </details>
  );
}

function AgentCard({
  name,
  color,
  deep,
  border,
  role,
  lines,
}: {
  name: string;
  color: string;
  deep: string;
  border: string;
  role: string;
  lines: string[];
}) {
  return (
    <div className={`rounded-2xl border ${border} bg-panel p-5`}>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-full ${deep} font-display text-xl italic ${color}`}
        >
          {name[0]}
        </span>
        <div>
          <div className={`font-display text-lg italic ${color}`}>{name}</div>
          <div className="text-[12px] text-muted">{role}</div>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-cream/80">
            <span className={`${color} shrink-0`}>·</span>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <main className="mx-auto max-w-[1100px] px-6 py-5">
      <Nav />

      <div className="mx-auto max-w-3xl py-14 text-center">
        <h1 className="font-display text-[42px] leading-tight text-cream">
          Two agents. <em className="text-flo">Opposing interests.</em>
          <br />
          One deal.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          Secondhand wholesale is haggling between strangers over one-of-a-kind stock. We gave
          each side an agent. Humans only decide.
        </p>
      </div>

      <Act n="I" title="Every trader gets an agent">
        <div className="grid gap-4 md:grid-cols-2">
          <AgentCard
            name="Flo"
            color="text-flo"
            deep="bg-flo-deep"
            border="border-flo/25"
            role="sells for the supplier"
            lines={[
              'Knows every item, grade, and defect in her warehouse.',
              'Remembers each buyer — and negotiates repeat buyers differently.',
              'Upsells like a saleswoman. Never sells below her owner’s floor.',
            ]}
          />
          <AgentCard
            name="Finn"
            color="text-finn"
            deep="bg-finn-deep"
            border="border-finn/25"
            role="buys for the reseller"
            lines={[
              'Takes your brief. Scouts every supplier. Picks the bundle himself.',
              'Your spend ceiling is enforced in code — he can’t exceed it.',
              'Haggles evidence-first, anchored to the oracle’s comps.',
            ]}
          />
        </div>
      </Act>

      <Act n="II" title="A price oracle grounds every number">
        <p className="text-cream/85">
          Every item gets an estimate, a range, and cited sold comps — before anyone haggles.
        </p>
        <More>
          <p>
            There is no blue book for a 90s Carhartt with a repaired seam, so we built one. Both
            agents negotiate against the same ground truth; that is what keeps the haggling honest.
          </p>
          <p className="rounded-xl border border-line bg-panel p-3 font-mono text-[12px] text-cream/70">
            item-004 · Carhartt Detroit jacket · grade B
            <br />
            <span className="text-brass">estimate £58</span> · range £46–£72 · &quot;comp: eBay
            sold £62, similar fade&quot;
          </p>
        </More>
      </Act>

      <Act n="III" title="A state machine referees the haggle">
        <p className="text-cream/85">
          Agents trade structured moves — offer, counter, restructure the bundle, accept. Hard
          limits are enforced in code, not prompts.
        </p>
        <More>
          <p>
            Finn physically cannot offer above his maximum; Flo cannot accept below her floor.
            Prompt injection bounces off — take a side over in the war room and try to fleece
            them. Bundle restructuring (&quot;drop the two damaged flannels and £180 works&quot;)
            is what makes this wholesale negotiation, not a price slider.
          </p>
        </More>
      </Act>

      <Act n="IV" title="Humans make every final call">
        <p className="text-cream/85">
          An agent&apos;s accept is a handshake, not a signature. Deals close when both owners
          approve.
        </p>
        <More>
          <p>
            Send a deal back with a note — &quot;too rich, push for £60&quot; — and your agent
            reworks it. When Flo upsells past your ceiling, Finn pauses and asks you for a new
            one. Deadlocks return to the owners; sealed-bid mediation (both limits disclosed
            privately, deal clears at the midpoint, neither number revealed) runs only if both
            sides consent. The supplier&apos;s owner is played by an AI persona, clearly labelled
            — take the seller side over and you become the owner.
          </p>
        </More>
      </Act>

      <Act n="V" title="What's live, what's seeded">
        <p className="text-cream/85">
          <span className="text-deal">Live:</span> every move, private thought, takeover,
          approval, and mediation. <span className="text-brass">Seeded:</span> the inventory,
          profiles, and market history — synthetic, per the hackathon&apos;s guidance.
        </p>
        <More>
          <p>
            Negotiation moves run on Claude Haiku 4.5, streamed; scouting and the oracle on
            Claude Sonnet 5 (oracle prices computed once and cached). Roadmap, deliberately out
            of one-day scope: real onboarding — a supplier photographs a pile into a priced
            storefront, a reseller connects their shop so Finn learns real demand. The seeded
            profiles are what those flows would produce.
          </p>
        </More>
      </Act>

      <footer className="border-t border-line py-8 text-center">
        <div className="font-display italic text-muted">
          Built solo, in a day, at the Fleek × a16z London hackathon — 11 July 2026.
        </div>
        <div className="microlabel mt-2">
          Agents &amp; LLMs track · Claude Haiku 4.5 + Sonnet 5 · Next.js
        </div>
      </footer>
    </main>
  );
}
