import { generateMove } from './agents';
import { getEventLog } from './eventlog';
import type { callWithTool } from './llm';
import { getMarket } from './market';
import { mediate } from './mediator';
import { applyMove, validateMove } from './negotiation';
import type { MoveInput, NegotiationState, Side } from './types';

interface Deps {
  llm?: typeof callWithTool;
}

function privateVis(side: Side): 'buyer_private' | 'seller_private' {
  return side === 'buyer' ? 'buyer_private' : 'seller_private';
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
  log.append({
    negotiationId: negId,
    visibility: 'public',
    type: 'move',
    payload: {
      side,
      action: move.action,
      price: move.price,
      bundleItemIds: move.bundleItemIds,
      message: move.message,
    },
  });

  const next = applyMove(neg, side, move);
  market.negotiations.set(negId, next);

  if (next.status !== 'active') {
    log.append({
      negotiationId: negId,
      visibility: 'public',
      type: 'status',
      payload: { status: next.status, agreedPrice: next.agreedPrice },
    });
  }
}

function defaultMove(negId: string, side: Side): MoveInput {
  const market = getMarket();
  const neg = market.negotiations.get(negId)!;
  if (neg.round >= neg.roundCap) {
    return { action: 'invoke_mediator', message: 'We are going in circles — let a neutral mediator settle it.', privateReasoning: 'fallback: round cap reached after invalid LLM output' };
  }
  const v = market.bundleValue(neg.bundleItemIds);
  const own = neg.lastOffer?.side === side ? neg.lastOffer.price : undefined;
  const price =
    own ??
    (side === 'buyer'
      ? Math.min(market.buyerMax(neg.buyerId, neg.bundleItemIds), Math.round(v * 0.35))
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

  let move = await generateMove(market, neg, side, undefined, deps.llm);
  let result = validateMove(neg, side, move, market.validationCtx(neg));
  if (!result.ok) {
    move = await generateMove(market, neg, side, result.reason, deps.llm);
    result = validateMove(neg, side, move, market.validationCtx(neg));
  }
  if (!result.ok) {
    move = defaultMove(negId, side);
    result = validateMove(neg, side, move, market.validationCtx(neg));
    if (!result.ok) {
      // Last resort: mediator is always a legal move on your turn.
      move = { action: 'invoke_mediator', message: 'Requesting mediation.', privateReasoning: 'fallback' };
      result = { ok: true, warnings: [] };
    }
  }
  applyAndEmit(negId, side, move, result.ok ? result.warnings : []);
}

export function runMediation(negId: string): void {
  const market = getMarket();
  const log = getEventLog();
  const neg = market.negotiations.get(negId);
  if (!neg || neg.status !== 'mediation') return;

  const buyerMax = market.buyerMax(neg.buyerId, neg.bundleItemIds);
  const sellerFloor = market.sellerFloor(neg.sellerId, neg.bundleItemIds);

  log.append({ negotiationId: negId, visibility: 'buyer_private', type: 'mediation_sealed', payload: { side: 'buyer', value: buyerMax } });
  log.append({ negotiationId: negId, visibility: 'seller_private', type: 'mediation_sealed', payload: { side: 'seller', value: sellerFloor } });

  const result = mediate(buyerMax, sellerFloor);
  const next: NegotiationState = {
    ...neg,
    status: result.deal ? 'mediated_deal' : 'mediation_no_deal',
    agreedPrice: result.price,
  };
  market.negotiations.set(negId, next);

  // Public: ONLY the verdict/clearing price. Never the bounds.
  log.append({ negotiationId: negId, visibility: 'public', type: 'mediation_result', payload: { deal: result.deal, price: result.price } });
  log.append({ negotiationId: negId, visibility: 'public', type: 'status', payload: { status: next.status, agreedPrice: next.agreedPrice } });
}

const running = new Set<string>();

export async function runNegotiation(negId: string, deps: Deps = {}): Promise<void> {
  if (running.has(negId)) return; // one loop per negotiation
  running.add(negId);
  try {
    let guard = 0;
    while (guard++ < 60) {
      const neg = getMarket().negotiations.get(negId);
      if (!neg) return;
      if (neg.status === 'mediation') {
        runMediation(negId);
        return;
      }
      if (neg.status !== 'active') return;
      if (neg.control[neg.turn] === 'human') return; // paused for takeover; POST /api/move resumes
      await stepAgent(negId, deps);
    }
  } finally {
    running.delete(negId);
  }
}
