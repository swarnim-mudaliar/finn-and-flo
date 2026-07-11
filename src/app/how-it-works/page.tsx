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
      <div className="border-l border-line pb-12 pl-6">
        <h2 className="font-display text-xl text-cream">{title}</h2>
        <div className="mt-3 max-w-2xl space-y-3 text-[14px] leading-relaxed text-muted">
          {children}
        </div>
      </div>
    </section>
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

      <div className="mx-auto max-w-3xl py-16 text-center">
        <h1 className="font-display text-[42px] leading-tight text-cream">
          Two agents. <em className="text-flo">Opposing interests.</em>
          <br />
          One deal.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          Secondhand wholesale runs on haggling: every item is one-of-a-kind, there is no price
          authority, and every deal is a negotiation between strangers in different time zones.
          Finn &amp; Flo gives each side a personal agent that does the haggling — so humans only
          decide.
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
              'Knows the warehouse: every item, grade, and defect in the catalog.',
              'Remembers each buyer — past deals, concession patterns, payment reliability — and negotiates repeat buyers differently.',
              'Upsells like a saleswoman: offers additions from her shelf when they fit the buyer’s interests, and drops back gracefully when declined.',
              'Answers every enquiry instantly, 24/7, and never sells below the owner’s floor.',
            ]}
          />
          <AgentCard
            name="Finn"
            color="text-finn"
            deep="bg-finn-deep"
            border="border-finn/25"
            role="buys for the reseller"
            lines={[
              'Takes your brief — “workwear my shop can flip fast, £180 max” — scouts every supplier’s stock, and picks the supplier and the bundle himself.',
              'Your spend ceiling becomes a hard cap enforced in code, alongside the maximum derived from the shop’s margins.',
              'Haggles evidence-first: every offer anchored to the oracle’s comps — and declines upsells that don’t serve the brief.',
            ]}
          />
        </div>
      </Act>

      <Act n="II" title="The oracle prices everything first">
        <p>
          There is no blue book for a 90s Carhartt with a repaired seam. Our price oracle builds
          one: for every item it reads sold comps for that archetype and produces an estimate, a
          confidence range, and cited evidence. Both agents negotiate against the same ground
          truth — which is exactly what keeps the haggling honest.
        </p>
        <p className="rounded-xl border border-line bg-panel p-4 font-mono text-[12px] text-cream/70">
          item-004 · Carhartt Detroit jacket · grade B
          <br />
          <span className="text-brass">estimate £58</span> · range £46–£72 · &quot;comp: eBay sold
          £62, 2026-06-14, similar fade&quot;
        </p>
      </Act>

      <Act n="III" title="Agents negotiate — a state machine referees">
        <p>
          Finn and Flo trade structured moves: offer, counter, accept, reject, walk away — or
          restructure the bundle mid-deal (&quot;drop the two damaged flannels and £180
          works&quot;). That last one is what makes it wholesale negotiation rather than a price
          slider.
        </p>
        <p>
          Every move passes through a validating state machine. Turn order, round caps, price
          sanity, and — critically — <span className="text-cream">reservation prices are enforced
          in code</span>: Finn physically cannot offer above his maximum, Flo cannot accept below
          her floor. Prompt injection bounces off. Take a side over yourself in the war room and
          try.
        </p>
      </Act>

      <Act n="IV" title="Humans make every final call">
        <p>
          An agent&apos;s accept is a <span className="text-cream">handshake, not a signature</span>:
          the deal closes only when both owners approve. Send it back with a note — &quot;too
          rich, push for £60&quot; — and your agent reopens the negotiation with your note as
          its top priority. When Flo upsells past your stated ceiling, Finn doesn&apos;t guess:
          he pauses and asks you for a new one.
        </p>
        <p>
          And when agents deadlock, the negotiation <span className="text-cream">returns to the
          humans</span>. Sealed-bid mediation exists — both sides privately disclose their true
          limits and the deal clears at the midpoint, neither number ever revealed
          (Chatterjee–Samuelson) — but it runs only if <span className="text-cream">both sides
          consent</span>. Nobody gets arbitrated against their will.
        </p>
      </Act>

      <Act n="V" title="What's live and what's seeded (honesty section)">
        <p>
          <span className="text-cream">Live:</span> every negotiation move, every private
          reasoning line, the takeover, and the mediation are real agent decisions happening as
          you watch (Claude Haiku 4.5 per move, streamed).
        </p>
        <p>
          <span className="text-cream">Seeded:</span> the inventory, both traders&apos; profiles,
          and the marketplace history they&apos;re built from are synthetic — per the
          hackathon&apos;s guidance to assume transaction history exists. Oracle prices are
          computed once (Claude Sonnet 5) and cached.
        </p>
        <p>
          <span className="text-cream">Roadmap, deliberately out of one-day scope:</span>{' '}
          onboarding flows — a supplier photographing a pile into a cataloged, priced storefront
          (vision), and a reseller connecting their shop so Finn learns real demand. The
          profiles you see are what those flows would produce.
        </p>
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
