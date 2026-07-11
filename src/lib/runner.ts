import { generateMove } from './agents';
import { getEventLog } from './eventlog';
import { callWithTool } from './llm';
import { getMarket } from './market';
import { mediate } from './mediator';
import { applyMove, validateMove, type ValidationResult } from './negotiation';
import type { MoveInput, NegotiationState, Side } from './types';

interface Deps {
  llm?: typeof callWithTool;
}

// ---- The AI owner on the supplier side ------------------------------------
// A solo visitor plays Finn's owner; nobody is there to play Flo's. After a
// short review window (in which a human CAN still decide for her), an AI owner
// persona makes the seller-side call. A human who has taken the seller side
// over disables this entirely — they ARE the owner then.
const OWNER_REVIEW_MS = 7000;

function scheduleSellerOwner(negId: string): void {
  if (process.env.VITEST) return; // tests drive approvals explicitly
  setTimeout(() => {
    void sellerOwnerReview(negId);
  }, OWNER_REVIEW_MS);
}

async function sellerOwnerReview(negId: string): Promise<void> {
  const market = getMarket();
  const neg = market.negotiations.get(negId);
  if (!neg || neg.control.seller === 'human') return;

  if (neg.status === 'escalated' && !neg.mediationConsent?.seller) {
    consentMediation(negId, 'seller', { auto: true });
    return;
  }
  if (neg.status !== 'pending_approval' || neg.approvals?.seller !== undefined) return;

  let approve = true;
  let note = 'Fair price for the lot — approved.';
  try {
    const s = market.seller(neg.sellerId);
    const out = (await callWithTool({
      tier: 'haiku',
      system: `You are the human owner of ${s.warehouseName}. ${s.persona} Your selling agent Flo negotiated a provisional wholesale deal and it needs your sign-off. You almost always approve deals at or above your floor — send one back only if something is clearly wrong. Your note is ONE short sentence in your own voice.`,
      messages: [
        {
          role: 'user',
          content: `Provisional deal: £${neg.agreedPrice} for a ${neg.bundleItemIds.length}-item bundle (oracle resale ~£${market.bundleValue(neg.bundleItemIds)}; your floor was £${market.sellerFloor(neg.sellerId, neg.bundleItemIds)}). Approve or send back?`,
        },
      ],
      toolName: 'decide',
      toolDescription: 'Approve or send back the provisional deal',
      inputSchema: {
        type: 'object',
        properties: { approve: { type: 'boolean' }, note: { type: 'string' } },
        required: ['approve', 'note'],
      },
      maxTokens: 300,
    })) as { approve: boolean; note: string };
    approve = Boolean(out.approve);
    if (out.note) note = String(out.note);
  } catch {
    /* default approve keeps the floor moving */
  }
  // Re-check after the await: a human may have decided (or taken over) meanwhile.
  const cur = market.negotiations.get(negId);
  if (!cur || cur.status !== 'pending_approval' || cur.approvals?.seller !== undefined || cur.control.seller === 'human') {
    return;
  }
  approveDeal(negId, 'seller', approve, note, { auto: true });
}

function privateVis(side: Side): 'buyer_private' | 'seller_private' {
  return side === 'buyer' ? 'buyer_private' : 'seller_private';
}

function emitStatus(neg: NegotiationState): void {
  getEventLog().append({
    negotiationId: neg.id,
    visibility: 'public',
    type: 'status',
    payload: { status: neg.status, agreedPrice: neg.agreedPrice, turn: neg.turn },
  });
}

export function applyAndEmit(negId: string, side: Side, move: MoveInput, warnings: string[]): void {
  const market = getMarket();
  const log = getEventLog();
  const neg = market.negotiations.get(negId);
  if (!neg) throw new Error(`unknown negotiation ${negId}`);

  if (move.privateReasoning) {
    log.append({
      negotiationId: negId,
      visibility: privateVis(side),
      type: 'reasoning',
      payload: { side, text: move.privateReasoning },
    });
  }
  for (const w of warnings) {
    log.append({ negotiationId: negId, visibility: privateVis(side), type: 'validation_warning', payload: { side, text: w } });
  }
  // Normalize what the room sees: an accept closes at the standing offer's price —
  // never at whatever number the model happened to place in the price field — and
  // cannot restructure the bundle.
  const priced = move.action === 'offer' || move.action === 'counter';
  log.append({
    negotiationId: negId,
    visibility: 'public',
    type: 'move',
    payload: {
      side,
      action: move.action,
      price: move.action === 'accept' ? neg.lastOffer?.price : priced ? move.price : undefined,
      bundleItemIds: priced ? move.bundleItemIds : undefined,
      message: move.message,
    },
  });

  const next = applyMove(neg, side, move);

  // A human accepting through takeover IS their side's final call — record the approval.
  if (move.action === 'accept' && neg.control[side] === 'human') {
    next.approvals = { ...next.approvals, [side]: true };
  }

  // Upsell gate: the seller grew the bundle while the buyer's owner has a spend ceiling.
  // Finn pauses and asks his human for a new cap before responding to the bigger lot.
  if (
    side === 'seller' &&
    move.bundleItemIds &&
    next.status === 'active' &&
    neg.buyerCap !== undefined &&
    next.control.buyer === 'agent'
  ) {
    const prev = new Set(neg.bundleItemIds);
    const added = move.bundleItemIds.filter((id) => !prev.has(id));
    if (added.length > 0) {
      const newOracle = market.bundleValue(move.bundleItemIds);
      const economic = market.buyerMax(neg.buyerId, move.bundleItemIds);
      next.awaitingCap = true;
      log.append({
        negotiationId: negId,
        visibility: 'buyer_private',
        type: 'cap_raise_requested',
        payload: {
          addedItemIds: added,
          currentCap: neg.buyerCap,
          newBundleOracle: newOracle,
          suggestedCap: Math.min(economic, Math.round(newOracle * 0.45)),
        },
      });
    }
  }

  market.negotiations.set(negId, next);

  if (next.status !== 'active') emitStatus(next);
  if (next.status === 'pending_approval') scheduleSellerOwner(negId);
}

function defaultMove(negId: string, side: Side): MoveInput {
  const market = getMarket();
  const neg = market.negotiations.get(negId)!;
  if (neg.round >= neg.roundCap) {
    return {
      action: 'invoke_mediator',
      message: 'We are going in circles — I propose we let a neutral mediator settle it, if you agree.',
      privateReasoning: 'fallback: round cap reached after invalid LLM output',
    };
  }
  const v = market.bundleValue(neg.bundleItemIds);
  const own = neg.lastOffer?.side === side ? neg.lastOffer.price : undefined;
  const price =
    own ??
    (side === 'buyer'
      ? Math.min(market.effectiveBuyerMax(neg, neg.bundleItemIds), Math.round(v * 0.35))
      : Math.max(market.sellerFloor(neg.sellerId, neg.bundleItemIds), Math.round(v * 0.6)));
  return {
    action: neg.lastOffer ? 'counter' : 'offer',
    price,
    message: 'Holding at this price for now.',
    privateReasoning: 'fallback move after invalid LLM output',
  };
}

export async function stepAgent(negId: string, deps: Deps = {}): Promise<void> {
  const market = getMarket();
  const neg = market.negotiations.get(negId);
  if (!neg || neg.status !== 'active') return;
  const side = neg.turn;

  let move: MoveInput = defaultMove(negId, side);
  let result: ValidationResult = { ok: false, reason: 'no move generated yet' };
  // A live Haiku 529/overload, network blip, or a malformed tool response that fails
  // MoveZod.parse throws here. Catch it so the negotiation falls through to the safe
  // default path below instead of leaking an unhandled rejection out of
  // `void runNegotiation()` and freezing the panel with no recovery trigger.
  try {
    move = await generateMove(market, neg, side, undefined, deps.llm);
    result = validateMove(neg, side, move, market.validationCtx(neg));
    if (!result.ok) {
      move = await generateMove(market, neg, side, result.reason, deps.llm);
      result = validateMove(neg, side, move, market.validationCtx(neg));
    }
  } catch {
    result = { ok: false, reason: 'llm call failed' };
  }
  if (!result.ok) {
    move = defaultMove(negId, side);
    result = validateMove(neg, side, move, market.validationCtx(neg));
    if (!result.ok) {
      // Last resort: proposing mediation is always a legal move on your turn.
      move = { action: 'invoke_mediator', message: 'I propose mediation.', privateReasoning: 'fallback' };
      result = { ok: true, warnings: [] };
    }
  }
  // Takeover race: a human may have taken control (or the state otherwise moved on)
  // while we were awaiting the LLM. Re-check before committing an agent move so we
  // never apply a stale agent turn after control has flipped to human.
  const current = market.negotiations.get(negId);
  if (!current || current.status !== 'active' || current.turn !== side || current.control[side] === 'human') {
    return;
  }
  applyAndEmit(negId, side, move, result.ok ? result.warnings : []);
}

export function runMediation(negId: string): void {
  const market = getMarket();
  const log = getEventLog();
  const neg = market.negotiations.get(negId);
  if (!neg || neg.status !== 'mediation') return;

  const buyerMax = market.effectiveBuyerMax(neg, neg.bundleItemIds);
  const sellerFloor = market.sellerFloor(neg.sellerId, neg.bundleItemIds);

  log.append({ negotiationId: negId, visibility: 'buyer_private', type: 'mediation_sealed', payload: { side: 'buyer', value: buyerMax } });
  log.append({ negotiationId: negId, visibility: 'seller_private', type: 'mediation_sealed', payload: { side: 'seller', value: sellerFloor } });

  const result = mediate(buyerMax, sellerFloor);
  // A mediated clearing price is still provisional — the owners have the final call.
  const next: NegotiationState = {
    ...neg,
    status: result.deal ? 'pending_approval' : 'mediation_no_deal',
    agreedPrice: result.price,
    mediated: result.deal ? true : undefined,
    approvals: {},
  };
  market.negotiations.set(negId, next);

  // Public: ONLY the verdict/clearing price. Never the bounds.
  log.append({ negotiationId: negId, visibility: 'public', type: 'mediation_result', payload: { deal: result.deal, price: result.price } });
  emitStatus(next);
  if (next.status === 'pending_approval') scheduleSellerOwner(negId);
}

function escalate(negId: string): void {
  const market = getMarket();
  const neg = market.negotiations.get(negId);
  if (!neg || neg.status !== 'active') return;
  const next: NegotiationState = { ...neg, status: 'escalated' };
  market.negotiations.set(negId, next);
  emitStatus(next);
  scheduleSellerOwner(negId);
}

// Owner sign-off on a provisional deal. Both approvals close it; one rejection
// reopens the negotiation with the note in the transcript.
export function approveDeal(negId: string, side: Side, approve: boolean, note?: string, opts?: { auto?: boolean }): { ok: boolean; error?: string } {
  const market = getMarket();
  const log = getEventLog();
  const neg = market.negotiations.get(negId);
  if (!neg) return { ok: false, error: 'unknown negotiation' };
  if (neg.status !== 'pending_approval') return { ok: false, error: 'no deal awaiting approval' };

  log.append({
    negotiationId: negId,
    visibility: 'public',
    type: 'approval_decision',
    payload: { side, approved: approve, note, auto: opts?.auto },
  });

  if (approve) {
    const approvals = { ...neg.approvals, [side]: true };
    const next: NegotiationState = { ...neg, approvals };
    if (approvals.buyer && approvals.seller) {
      next.status = neg.mediated ? 'mediated_deal' : 'deal';
    }
    market.negotiations.set(negId, next);
    if (next.status !== 'pending_approval') emitStatus(next);
    return { ok: true };
  }

  // Rejection: back to the table. The rejecting side's agent moves next, informed by the note.
  const next: NegotiationState = {
    ...neg,
    status: 'active',
    agreedPrice: undefined,
    approvals: {},
    mediated: undefined,
    turn: side,
    roundCap: neg.roundCap + 2, // grace rounds so a rework isn't instantly cap-blocked
  };
  market.negotiations.set(negId, next);
  emitStatus(next);
  void runNegotiation(negId);
  return { ok: true };
}

// Buyer's owner responds to an upsell ceiling request.
export function decideCap(negId: string, newCap: number | null): { ok: boolean; error?: string } {
  const market = getMarket();
  const log = getEventLog();
  const neg = market.negotiations.get(negId);
  if (!neg) return { ok: false, error: 'unknown negotiation' };
  if (!neg.awaitingCap) return { ok: false, error: 'no ceiling request pending' };

  const next: NegotiationState = { ...neg, awaitingCap: false };
  if (newCap !== null && newCap > 0) {
    next.buyerCap = newCap;
    next.capDeclined = false;
  } else {
    next.capDeclined = true;
  }
  market.negotiations.set(negId, next);
  log.append({
    negotiationId: negId,
    visibility: 'buyer_private',
    type: 'cap_decision',
    payload: newCap !== null && newCap > 0 ? { granted: true, newCap } : { granted: false },
  });
  void runNegotiation(negId);
  return { ok: true };
}

// An owner consents to mediation on an escalated (or active) negotiation.
export function consentMediation(negId: string, side: Side, opts?: { auto?: boolean }): { ok: boolean; error?: string } {
  const market = getMarket();
  const log = getEventLog();
  const neg = market.negotiations.get(negId);
  if (!neg) return { ok: false, error: 'unknown negotiation' };
  if (neg.status !== 'escalated' && neg.status !== 'active') {
    return { ok: false, error: 'negotiation is not open to mediation consent' };
  }

  const mediationConsent = { ...neg.mediationConsent, [side]: true };
  log.append({
    negotiationId: negId,
    visibility: 'public',
    type: 'mediation_consent',
    payload: { side, byOwner: true, auto: opts?.auto },
  });
  const both = mediationConsent.buyer && mediationConsent.seller;
  const next: NegotiationState = { ...neg, mediationConsent, status: both ? 'mediation' : neg.status };
  market.negotiations.set(negId, next);
  if (both) runMediation(negId);
  return { ok: true };
}

// An owner reopens an escalated negotiation by taking their side over.
export function resumeEscalated(negId: string): void {
  const market = getMarket();
  const neg = market.negotiations.get(negId);
  if (!neg || neg.status !== 'escalated') return;
  const next: NegotiationState = { ...neg, status: 'active', roundCap: neg.roundCap + 4 };
  market.negotiations.set(negId, next);
  emitStatus(next);
}

const running = new Set<string>();

export async function runNegotiation(negId: string, deps: Deps = {}): Promise<void> {
  if (running.has(negId)) return; // one loop per negotiation
  running.add(negId);
  try {
    let guard = 0;
    let stuckAtCap = 0;
    while (guard++ < 60) {
      const neg = getMarket().negotiations.get(negId);
      if (!neg) return;
      if (neg.status === 'mediation') {
        runMediation(negId);
        return;
      }
      if (neg.status !== 'active') return; // pending_approval / escalated / terminal — humans have it
      if (neg.awaitingCap) return; // paused for the buyer's owner; /api/cap resumes
      if (neg.control[neg.turn] === 'human') return; // paused for takeover; POST /api/move resumes

      // Past the round cap, agents can only accept / walk / propose mediation. If they
      // churn there without converging, the deadlock goes back to the owners.
      if (neg.round >= neg.roundCap && ++stuckAtCap > 4) {
        escalate(negId);
        return;
      }
      await stepAgent(negId, deps);
    }
    // Guard cap exhausted without a terminal status: return it to the owners.
    escalate(negId);
  } finally {
    running.delete(negId);
  }
}
