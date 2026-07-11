import type { MoveInput, NegotiationState, Side } from './types';

export interface ValidationCtx {
  bundleOracleValue: (itemIds: string[]) => number;
  // Reservation prices are functions of the item set so a RESTRUCTURING move
  // (different bundle than the negotiation's current one) is validated against the
  // reservation of the bundle it actually proposes — not the stale pre-restructure bundle.
  buyerMax: (itemIds: string[]) => number;
  sellerFloor: (itemIds: string[]) => number;
  inventoryIds: Set<string>;
}

export type ValidationResult = { ok: true; warnings: string[] } | { ok: false; reason: string };

export function validateMove(
  state: NegotiationState,
  side: Side,
  move: MoveInput,
  ctx: ValidationCtx
): ValidationResult {
  if (state.status !== 'active') return { ok: false, reason: 'negotiation is not active' };
  if (state.turn !== side) return { ok: false, reason: `not ${side}'s turn` };

  const warnings: string[] = [];
  const priced = move.action === 'offer' || move.action === 'counter';
  const atCap = state.round >= state.roundCap;

  // At the round cap only closure moves are legal. `reject` is capped too: otherwise two
  // agents that keep rejecting increment the round past the cap forever and only terminate
  // via the guard=60 fallback, burning dozens of live LLM calls on one stuck negotiation.
  if (atCap && (priced || move.action === 'reject')) {
    return { ok: false, reason: 'round cap reached: accept, walk_away, or invoke_mediator only' };
  }

  if (move.action === 'accept') {
    if (!state.lastOffer || state.lastOffer.side === side) {
      return { ok: false, reason: 'nothing to accept' };
    }
    const p = state.lastOffer.price;
    const acceptBundle = state.lastOffer.bundleItemIds;
    if (side === 'buyer' && p > ctx.buyerMax(acceptBundle)) {
      return { ok: false, reason: `accepting £${p} exceeds your maximum of £${ctx.buyerMax(acceptBundle)}` };
    }
    if (side === 'seller' && p < ctx.sellerFloor(acceptBundle)) {
      return { ok: false, reason: `accepting £${p} is below your floor of £${ctx.sellerFloor(acceptBundle)}` };
    }
    return { ok: true, warnings };
  }

  if (priced) {
    if (move.price === undefined || move.price <= 0) {
      return { ok: false, reason: 'offer requires a positive price' };
    }
    const bundle = move.bundleItemIds ?? state.bundleItemIds;
    if (bundle.length === 0) return { ok: false, reason: 'bundle cannot be empty' };
    for (const id of bundle) {
      if (!ctx.inventoryIds.has(id)) return { ok: false, reason: `unknown item in bundle: ${id}` };
    }
    const v = ctx.bundleOracleValue(bundle);
    if (v > 0 && (move.price < v * 0.1 || move.price > v * 5)) {
      return { ok: false, reason: `price £${move.price} is outside a sane range for a bundle worth ~£${v}` };
    }
    if (side === 'buyer' && move.price > ctx.buyerMax(bundle)) {
      return { ok: false, reason: `offer of £${move.price} exceeds your maximum of £${ctx.buyerMax(bundle)}` };
    }
    if (side === 'seller' && move.price < ctx.sellerFloor(bundle)) {
      return { ok: false, reason: `ask of £${move.price} is below your floor of £${ctx.sellerFloor(bundle)}` };
    }
    // Soft signals: concession-direction oddities are warnings, never rejections —
    // bundles change mid-negotiation and strict trajectory checks kill restructuring.
    if (state.lastOffer && state.lastOffer.side === side) {
      const sameBundle =
        JSON.stringify([...state.lastOffer.bundleItemIds].sort()) === JSON.stringify([...bundle].sort());
      if (sameBundle) {
        if (side === 'buyer' && move.price < state.lastOffer.price) {
          warnings.push('buyer lowered their own previous offer on an unchanged bundle');
        }
        if (side === 'seller' && move.price > state.lastOffer.price) {
          warnings.push('seller raised their own previous ask on an unchanged bundle');
        }
      }
    }
    return { ok: true, warnings };
  }

  // reject / walk_away / invoke_mediator are always allowed on your turn
  return { ok: true, warnings };
}

export function applyMove(state: NegotiationState, side: Side, move: MoveInput): NegotiationState {
  const next = structuredClone(state);
  next.turn = side === 'buyer' ? 'seller' : 'buyer';
  switch (move.action) {
    case 'offer':
    case 'counter': {
      const bundle = move.bundleItemIds ?? state.bundleItemIds;
      next.bundleItemIds = bundle;
      next.lastOffer = { side, price: move.price!, bundleItemIds: bundle };
      next.round += 1;
      break;
    }
    case 'accept':
      next.status = 'deal';
      next.agreedPrice = state.lastOffer!.price;
      break;
    case 'reject':
      next.lastOffer = undefined;
      next.round += 1; // a rejection consumes a round so reject-loops still reach the cap
      break;
    case 'walk_away':
      next.status = 'walked_away';
      break;
    case 'invoke_mediator':
      next.status = 'mediation';
      break;
  }
  return next;
}
