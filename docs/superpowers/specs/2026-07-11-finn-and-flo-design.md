# Finn & Flo — Personal Agents for Secondhand Wholesale

**Event:** Fleek x a16z Hackathon London, 11 July 2026 — Agents & LLMs track (cross-track with Vision).
**Constraint:** Solo builder + AI agent fleet. Submission 18:00, demo 18:30. Everything bootstrapped (no Fleek data/API).

## Product

Every participant on a wholesale secondhand marketplace gets a personal AI agent that works
*for them* — modelled on Jack & Jill's two-sided recruiting agents:

- **Flo** works for suppliers (rag-houses, wholesalers). She catalogs inventory from photo
  dumps, prices it against market comps, answers every buyer message instantly, and
  negotiates 24/7 within owner-set guardrails.
- **Finn** works for buyers (resellers, vintage shops). He learns what the shop actually
  sells (categories, brands, price points, sell-through), scouts listings, computes a
  defensible max willingness-to-pay per bundle, and negotiates on the buyer's behalf.

Finn and Flo negotiate **agent-to-agent**. Humans set intent and constraints; agents do the
haggling; humans approve the close. When a negotiation deadlocks, both agents privately
disclose their true reservation prices to a neutral **Mediator**, which clears deals that
posturing would have killed — without leaking either side's number.

This subsumes all four of the organizers' suggested projects (matchmaker, price predictor,
seller-that-never-ghosts, deal negotiator) as components of one system, each built one
level deeper than the naive version.

## Components

### 1. Negotiation engine (core)
- A `Negotiation` is a stateful multi-round exchange over a **bundle** (N items from one
  supplier's inventory).
- Each round an agent emits a **structured move** — `{action: offer|accept|reject|counter|walk_away|invoke_mediator, price, bundle_changes?, message}` — via tool-forced LLM calls.
  The chat `message` carries persuasion/rationale; the structured fields carry state.
  State machine validates every move (no accepting expired offers, no price regressions,
  round caps) so the LLM cannot corrupt a negotiation.
- Each agent holds **private state** never shown to the other side: reservation price,
  valuation breakdown, strategy notes, urgency. Prompt-isolation per agent (separate
  conversation contexts; the only shared channel is the public move log).
- Agents can restructure bundles mid-negotiation ("drop the two damaged flannels, then
  £180 works") — this is what makes it *wholesale* negotiation, not scalar haggling.
- Termination: accept (deal at price P), walk-away, round cap → auto-suggest mediator.
- Models: Haiku 4.5 (`claude-haiku-4-5-20251001`) for negotiation moves; Sonnet 5
  (`claude-sonnet-5`) where judgment is dense (valuation, mediator, strategy updates).

### 2. Price oracle ("the appraiser")
- Input: item (title, attributes, photo optional). Output: `{price_estimate, confidence_interval, evidence[]}`.
- **Comps corpus:** built during the hackathon by agents scraping/searching sold listings
  (eBay sold, Vinted, Grailed) for the ~15 item archetypes used in the demo inventory;
  cached as JSON. Live retrieval at demo time is a stretch goal, not a dependency.
- **Adversarial estimation:** a bull agent argues the high case, a bear the low case, both
  citing comps; a judge agent (Sonnet) resolves to a point estimate + interval + cited
  evidence trail. Rationale: single-shot LLM pricing is anchored and overconfident;
  debate widens the evidence surface and the interval is what negotiation strategy needs.
- Finn's max-buy = oracle estimate × target-margin discount, adjusted by his shop's
  demand model. Flo's floor = owner guardrail or oracle-derived.

### 3. Onboarding (the persona builders)
- **Flo onboarding:** supplier drops item photos → vision pass (Sonnet) catalogs each
  (brand, category, era, condition grade, defects) → oracle prices it → listing created.
  This is the cross-track Vision element.
- **Finn onboarding:** reseller provides shop sales history (CSV, demo dataset provided)
  → agent builds a demand profile: what sells, price bands, sell-through velocity,
  gaps in stock. Profile drives both scouting relevance and willingness-to-pay.

### 4. UI — split-screen war room
- Single web app, three views:
  - **Split-screen negotiation view** ("two phones"): left = supplier's view of Flo,
    right = buyer's view of Finn. Public chat in the middle; each side's **private
    reasoning pane** visible only on their half — the money shot: same negotiation,
    two secret agendas, live.
  - **Trading floor view:** grid of concurrent negotiations (10 Finns × 5 Flos), tickers
    for deals closed, total surplus, price-vs-oracle convergence.
  - **Human takeover:** a judge can seize control of either side mid-negotiation and
    type moves manually against the opposing agent.
- Live updates via SSE streaming from the backend.

### 5. Mediator (the flourish)
- On deadlock, both agents privately submit true reservation prices (sealed — separate
  API contexts, never entering the shared log).
- If buyer_max ≥ seller_floor: deal clears at the midpoint (split-the-difference,
  Chatterjee–Samuelson style); announce **only** the clearing price, never the bounds.
  If no overlap: announce "no deal possible" and nothing else.
- UI shows sealed envelopes → verdict, with an explicit "what the mediator saw vs. what
  the room saw" panel to prove no leakage.

## Architecture & stack

- **One Next.js (App Router, TypeScript) app** — API routes host the agent runtime,
  React front-end, SSE for live streams. One process, one deploy (Vercel or localhost
  for the demo; localhost is fine and safest).
- **Anthropic SDK** direct (no framework — LangChain etc. adds debugging surface, not
  capability, at this scale). Tool-forced JSON for all structured moves.
- **State: in-memory + JSON file snapshots.** No database. A `MarketState` singleton
  holds inventories, profiles, negotiations; snapshot to disk so a crash doesn't kill
  the demo. Rationale: 6 hours, single process, zero migration risk.
- **Demo data:** ~50-item synthetic supplier inventory (generated, realistic brands/
  conditions, with stock photos where needed), 2–3 reseller profiles with sales
  histories, comps corpus per archetype.
- **Budget:** ~$10 Anthropic API credits. Haiku for volume, Sonnet for judgment.
  Estimated full-day spend including testing: $5–15.

## Build slices (priority order, parallelizable)

| # | Slice | Depends on | Demo value if we stop here |
|---|---|---|---|
| 1 | Market state + demo data + negotiation engine (CLI-visible) | — | Agents haggle in terminal |
| 2 | Price oracle + comps corpus | — | Priced catalog with evidence |
| 3 | Split-screen UI + SSE + human takeover | 1 | The full core demo |
| 4 | Onboarding flows (photo catalog, shop ingest) | 2 | "From nothing to market in 60s" |
| 5 | Mediator | 1 | The mechanism-design kicker |
| 6 | Trading floor (concurrent negotiations dashboard) | 1,3 | The finale |

Slices 1+2 build first in parallel; 3 starts as soon as 1's event shapes exist.
**Kill order under time pressure: 6, then 4 (fake with pre-baked data), then 5.**
Slices 1+2+3 alone are a complete, winning demo.

## Demo script (3 min)

1. *"Meet Flo."* Photo dump → cataloged, priced listings with oracle evidence (30s).
2. *"Meet Finn."* Shop history in → demand profile, scouting brief (20s).
3. **The negotiation.** Split-screen: watch both agents' private reasoning diverge from
   their public chat; bundle restructured mid-deal; deal closes near oracle fair value (60s).
4. **Judge vs. agent.** A judge takes over the supplier side, tries to fleece Finn — his
   offers stay pinned to comp evidence (45s).
5. **The mediator.** Deadlocked negotiation → sealed reservation prices → deal rescued
   at the midpoint, provably without leakage (30s).
6. **The floor.** 10×5 agents trading concurrently; price discovery converges (15s).

## Risks & mitigations

- **LLM breaks negotiation state** → moves are validated by the state machine; invalid
  move = one retry with error feedback, then a safe default (counter at last price).
- **Comps scraping blocked** → corpus is pre-built during the day; demo never depends
  on live scraping.
- **Time collapse** → kill order above; every slice is independently demoable.
- **API outage at demo** → every negotiation run is recorded as an event log; a replay
  mode can re-render any past negotiation through the live UI.
- **Overlap with Fleek Sort** (their in-house VLM) → cataloging is deliberately a minor
  organ here; the product is the agent economy on top.

## Out of scope (explicitly)

Payments, auth, multi-tenancy, mobile, real Fleek integration, fine-tuning, actual
incentive-compatibility proofs for the mediator (we implement the honest-mediator
mechanism and demo the leak-free property, we don't prove IC — agents are programmed
honest, which we state on the slide).
