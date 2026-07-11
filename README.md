# Finn & Flo

Personal AI agents for both sides of wholesale secondhand fashion.
**Flo** sells for suppliers — prices from comps, answers instantly, negotiates 24/7 within owner guardrails.
**Finn** buys for resellers — knows the shop's demand from its sales history, and haggles so the human only decides.

Built solo at the Fleek x a16z London hackathon (11 July 2026), Agents & LLMs track.

## What's technically interesting

- **Agent-to-agent negotiation over restructurable bundles.** Agents emit structured moves
  through a validating state machine: hard invariants (turn order, round caps, reservation
  prices) are enforced **in code** — a judge who takes over live cannot talk Finn past his
  max, and prompt injection bounces off both the prompt layer and the state machine.
  Mid-deal bundle restructuring ("drop the two Y2K tees, then £106 works") is what makes it
  wholesale negotiation instead of scalar haggling.
- **Comps-grounded price oracle** (Sonnet 5): per-item estimate + confidence interval +
  cited comps, disk-cached so nothing is ever priced twice.
- **Everything is an event** tagged `public` / `buyer_private` / `seller_private`. The
  split-screen war room renders both private agendas live from the same stream; `?side=`
  gives a judge a server-scoped view where the other side's secrets never reach the
  browser. SSE backfills on refresh; **replay is just re-emitting the log**.
- **Deadlock mediator**: Chatterjee–Samuelson split-the-difference on sealed reservation
  prices — deals that posturing kills get rescued at the midpoint, and the room never sees
  either side's number.
- **Profiles from marketplace history**: Finn's willingness-to-pay derives from his shop's
  sales velocity and margin targets; Flo remembers past deals with each counterparty and
  negotiates repeat buyers differently.

## Run it

```bash
npm install
cp .env.example .env.local        # add your ANTHROPIC_API_KEY
npm run generate-data             # synthetic inventory/profiles/comps (once)
npm run price-inventory           # oracle pass, disk-cached (once)
npm run demo                      # next build && next start → http://localhost:3000
```

- `/` — the war room: watch a live negotiation, take over either side, replay recorded runs
- `/?side=seller` — judge mode: one side only, opponent's private events never sent
- `/catalog` — the oracle-priced inventory with evidence

Models: `claude-haiku-4-5` (negotiation moves), `claude-sonnet-5` (oracle & data generation).
LLM responses are streamed — flaky-network response hangs cost 60s+ per move before that fix.
