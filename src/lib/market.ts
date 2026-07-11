import fs from 'node:fs';
import path from 'node:path';
import { getEventLog } from './eventlog';
import { applyMove, type ValidationCtx } from './negotiation';
import type {
  BuyerProfile, Comp, Item, MoveAction, NegotiationState, NegotiationStatus,
  OraclePrice, RelationshipRecord, SellerProfile, Side,
} from './types';

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', file), 'utf8')) as T;
}

export class Market {
  items: Item[] = readJson('inventory.json');
  buyers: BuyerProfile[] = readJson('buyers.json');
  sellers: SellerProfile[] = readJson('sellers.json');
  relationships: RelationshipRecord[] = readJson('relationships.json');
  comps: Comp[] = readJson('comps.json');
  oracle: Record<string, OraclePrice> = readJson('oracle-cache.json');
  negotiations = new Map<string, NegotiationState>();
  // Briefs whose scout verdict was not a clean match — awaiting the owner's
  // pursue/abandon decision before any negotiation exists.
  pendingScouts = new Map<
    string,
    { buyerId: string; brief: string; sellerId: string; itemIds: string[]; rationale: string; openingPlan: string; briefBudgetMax?: number }
  >();

  constructor() {
    this.rehydrate();
  }

  // The in-memory negotiations Map is empty on a fresh process, but the event log is
  // reloaded from disk. Without this, after a `next start` restart the war-room dropdown
  // lists negotiations from prior runs whose take-over/send-move return 404 and which the
  // runner can't resume. Replay the durable event log to reconstruct their live state.
  private rehydrate(): void {
    for (const e of getEventLog().since(0)) {
      if (e.type === 'negotiation_created') {
        const p = e.payload as { buyerId: string; sellerId: string; itemIds: string[]; roundCap?: number };
        this.negotiations.set(e.negotiationId, {
          id: e.negotiationId, buyerId: p.buyerId, sellerId: p.sellerId,
          bundleItemIds: p.itemIds, turn: 'buyer', status: 'active',
          round: 0, roundCap: p.roundCap ?? 8,
          control: { buyer: 'agent', seller: 'agent' },
        });
        continue;
      }
      const neg = this.negotiations.get(e.negotiationId);
      if (!neg) continue;
      if (e.type === 'move') {
        const p = e.payload as { side: Side; action: MoveAction; price?: number; bundleItemIds?: string[]; message: string };
        this.negotiations.set(
          e.negotiationId,
          applyMove(neg, p.side, { action: p.action, price: p.price, bundleItemIds: p.bundleItemIds, message: p.message })
        );
      } else if (e.type === 'control_changed') {
        const p = e.payload as { side: Side; mode: 'agent' | 'human' };
        neg.control[p.side] = p.mode;
      } else if (e.type === 'status') {
        const p = e.payload as { status: NegotiationStatus; agreedPrice?: number };
        neg.status = p.status;
        if (p.agreedPrice !== undefined) neg.agreedPrice = p.agreedPrice;
      }
    }
  }

  item(id: string): Item {
    const it = this.items.find((i) => i.id === id);
    if (!it) throw new Error(`unknown item ${id}`);
    return it;
  }

  buyer(id: string): BuyerProfile {
    const b = this.buyers.find((x) => x.id === id);
    if (!b) throw new Error(`unknown buyer ${id}`);
    return b;
  }

  seller(id: string): SellerProfile {
    const s = this.sellers.find((x) => x.id === id);
    if (!s) throw new Error(`unknown seller ${id}`);
    return s;
  }

  relationship(buyerId: string, sellerId: string): RelationshipRecord | undefined {
    return this.relationships.find((r) => r.buyerId === buyerId && r.sellerId === sellerId);
  }

  itemsOf(sellerId: string) {
    return this.items.filter((i) => i.sellerId === sellerId);
  }

  bundleValue(itemIds: string[]): number {
    return Math.round(itemIds.reduce((sum, id) => sum + (this.oracle[id]?.estimate ?? 0), 0));
  }

  // Buyer's true max: resale value discounted by the margin their shop needs, capped by budget.
  buyerMax(buyerId: string, itemIds: string[]): number {
    const b = this.buyer(buyerId);
    const v = this.bundleValue(itemIds);
    return Math.min(b.budget, Math.round(v * (1 - b.targetMarginPct / 100)));
  }

  // Seller's true floor: wholesale clearing fraction of resale value (rag-houses buy by the kilo).
  sellerFloor(_sellerId: string, itemIds: string[]): number {
    return Math.round(this.bundleValue(itemIds) * 0.25);
  }

  // The binding maximum for a negotiation: shop economics AND the human's brief ceiling.
  // The brief cap is enforced here — in the state machine — not just in the prompt.
  effectiveBuyerMax(neg: NegotiationState, itemIds: string[]): number {
    const economic = this.buyerMax(neg.buyerId, itemIds);
    return neg.buyerCap !== undefined ? Math.min(economic, neg.buyerCap) : economic;
  }

  validationCtx(neg: NegotiationState): ValidationCtx {
    return {
      bundleOracleValue: (ids) => this.bundleValue(ids),
      buyerMax: (ids) => this.effectiveBuyerMax(neg, ids),
      sellerFloor: (ids) => this.sellerFloor(neg.sellerId, ids),
      inventoryIds: new Set(this.itemsOf(neg.sellerId).map((i) => i.id)),
    };
  }
}

const g = globalThis as unknown as { __market?: Market };

export function getMarket(): Market {
  g.__market ??= new Market();
  return g.__market;
}
