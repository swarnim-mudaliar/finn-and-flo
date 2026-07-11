export interface MediationResult {
  deal: boolean;
  price?: number;
}

// Chatterjee–Samuelson k=1/2 split-the-difference. Pure function: the server
// already holds both sides' private state; "sealed disclosure" is narrative.
export function mediate(buyerMax: number, sellerFloor: number): MediationResult {
  if (buyerMax >= sellerFloor) {
    return { deal: true, price: Math.round(((buyerMax + sellerFloor) / 2) * 100) / 100 };
  }
  return { deal: false };
}
