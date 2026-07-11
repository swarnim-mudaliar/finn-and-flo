# Finn & Flo

**Live: https://finn-and-flo-production.up.railway.app**

Personal AI agents for both sides of secondhand fashion wholesale.
**Finn** buys for resellers. **Flo** sells for suppliers. Agents haggle — humans decide.

Built solo at the Fleek × a16z London hackathon (11 July 2026), Agents & LLMs track.

## The loop

1. **Brief Finn** — "workwear my shop can flip fast, £150 max". A stated ceiling is
   **enforced in code**, not prompts.
2. **He scouts every supplier** (4 warehouses, ~130 one-of-a-kind items), picks the supplier
   and the bundle himself — and **says no** if nothing truly matches, offering the closest
   substitute for your call instead of pretending. Switch on **Search across stores** and he
   instead races up to 3 suppliers at once, each defended by its own Flo, citing rival quotes
   (truthfully — enforced by prompt, never naming the rival) as leverage. You take ONE deal;
   Finn politely closes the rest.
3. **Watch the haggle live** — public chat in the middle, each agent's private strategy in
   its own ledger. Flo upsells; when that would breach your ceiling, **Finn pauses and asks
   you for a new one**.
4. **Humans sign every deal.** An agent's accept is a handshake, not a signature — both
   owners must approve. Send it back with a note and your agent reworks the terms. The
   supplier's owner is an AI persona, clearly labelled; take the seller side over and you
   *are* the owner.

## Technically interesting

- **State machine referees the agents.** Turn order, round caps, price sanity, and
  reservation prices are hard-enforced in code — prompt injection can't move Finn past his
  maximum (take over and try to fleece him).
- **Comps-grounded price oracle** (Sonnet 5): estimate + range + cited sold comps per item,
  disk-cached. Both agents negotiate against the same ground truth.
- **Everything is an event** (`public` / `buyer_private` / `seller_private`). The war room
  renders both private agendas from one stream; `/war-room?side=seller` is a server-scoped
  judge view where the other side's secrets never reach the browser. SSE backfills on
  refresh; replay just re-emits the log.
- **Consent-based sealed-bid mediation** (Chatterjee–Samuelson): deadlocks return to the
  owners; if both consent, sealed limits clear at the midpoint and neither number is ever
  revealed.
- **Bundle restructuring both ways**: Flo adds items to upsell, Finn drops defect-heavy ones
  — wholesale negotiation, not a price slider. Upsell bubbles show the honest before/after
  (items and oracle value), and a deal summary distils every finished negotiation: price
  trajectory sparkline, final price vs oracle, upsells kept or reverted, both sign-offs.
- **Multi-store races stay asymmetric**: race grouping lives in buyer-private events only —
  the seller-scoped judge view can't reconstruct who else Finn is talking to, so a supplier
  learns about rivals only when Finn chooses to say so on the floor.

## Run it

```bash
npm install
cp .env.example .env.local        # add your ANTHROPIC_API_KEY
npm run demo                      # next build && next start → http://localhost:3000
```

Synthetic data ships in the repo (`npm run generate-data` / `expand-data` /
`price-inventory` only if you want to regenerate it).

- `/` — brief Finn (the front door)
- `/war-room` — the live floor: private ledgers, takeover, replay · `?side=seller` = judge mode
- `/catalog` — oracle-priced inventory with receipts
- `/how-it-works` — the 30-second version

Models: `claude-haiku-4-5` (negotiation moves, AI owner), `claude-sonnet-5` (scout, oracle,
data generation). Responses are streamed — venue-network response hangs cost 60s+ per move
before that fix.
