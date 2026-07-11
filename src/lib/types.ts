export type Side = 'buyer' | 'seller';
export type Visibility = 'public' | 'buyer_private' | 'seller_private';

export interface Item {
  id: string;
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
  | 'deal'
  | 'walked_away'
  | 'mediation'
  | 'mediated_deal'
  | 'mediation_no_deal';

export interface NegotiationState {
  id: string;
  buyerId: string;
  sellerId: string;
  bundleItemIds: string[];
  turn: Side;
  status: NegotiationStatus;
  agreedPrice?: number;
  round: number;
  roundCap: number;
  lastOffer?: { side: Side; price: number; bundleItemIds: string[] };
  control: Record<Side, 'agent' | 'human'>;
}

export interface MarketEvent {
  seq: number;
  ts: number;
  negotiationId: string;
  visibility: Visibility;
  type: string;
  payload: Record<string, unknown>;
}
