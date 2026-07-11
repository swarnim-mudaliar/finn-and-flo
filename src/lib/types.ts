export type Side = 'buyer' | 'seller';
export type Visibility = 'public' | 'buyer_private' | 'seller_private';

export interface Item {
  id: string;
  sellerId: string;
  title: string;
  brand: string;
  category: string;
  era: string;
  conditionGrade: 'A' | 'B' | 'C';
  defects: string[];
  archetype: string;
}

export interface Comp {
  archetype: string;
  title: string;
  soldPrice: number;
  soldDate: string;
  condition: string;
  source: string;
}

export interface OraclePrice {
  itemId: string;
  estimate: number;
  low: number;
  high: number;
  evidence: string[];
}

export interface BuyerProfile {
  id: string;
  shopName: string;
  persona: string;
  categoryDemand: Record<string, number>; // category -> weekly sell-through velocity
  salesNotes: string; // distilled from sales history
  budget: number;
  targetMarginPct: number; // margin the buyer needs on resale
}

export interface SellerProfile {
  id: string;
  warehouseName: string;
  persona: string;
  sellingNotes: string;
}

export interface RelationshipRecord {
  buyerId: string;
  sellerId: string;
  pastDeals: number;
  notes: string; // concession patterns, reliability, repeat-buyer status
}

export type MoveAction = 'offer' | 'counter' | 'accept' | 'reject' | 'walk_away' | 'invoke_mediator';

export interface MoveInput {
  action: MoveAction;
  price?: number;
  bundleItemIds?: string[];
  message: string;
  privateReasoning?: string;
}

export type NegotiationStatus =
  | 'active'
  | 'pending_approval' // agents shook hands; deal closes only when BOTH owners approve
  | 'escalated' // deadlock without mutual mediation consent — returned to the owners
  | 'deal'
  | 'walked_away'
  | 'mediation'
  | 'mediated_deal'
  | 'mediation_no_deal';

export interface NegotiationState {
  id: string;
  buyerId: string;
  sellerId: string;
  /** The human buyer's instruction to Finn ("I'm hunting workwear under £150"). */
  buyerBrief?: string;
  /** Finn's scouting rationale for the bundle he picked from the catalog. */
  scoutNotes?: string;
  /** Spend ceiling stated in the brief (GBP) — enforced in code, caps buyerMax. */
  buyerCap?: number;
  bundleItemIds: string[];
  turn: Side;
  status: NegotiationStatus;
  agreedPrice?: number;
  round: number;
  roundCap: number;
  lastOffer?: { side: Side; price: number; bundleItemIds: string[] };
  control: Record<Side, 'agent' | 'human'>;
  /** Owner sign-offs while status is pending_approval. Deal closes when both true. */
  approvals?: Partial<Record<Side, boolean>>;
  /** invoke_mediator only PROPOSES; mediation runs when both sides have consented. */
  mediationConsent?: Partial<Record<Side, boolean>>;
  /** Paused waiting for the buyer's owner to grant/decline a new spend ceiling (upsell). */
  awaitingCap?: boolean;
  /** The buyer's owner declined a ceiling raise — Finn must not chase additions past the cap. */
  capDeclined?: boolean;
  /** Provisional agreement came from mediation (affects final status on approval). */
  mediated?: boolean;
}

export interface MarketEvent {
  seq: number;
  ts: number;
  negotiationId: string;
  visibility: Visibility;
  type: string;
  payload: Record<string, unknown>;
}
