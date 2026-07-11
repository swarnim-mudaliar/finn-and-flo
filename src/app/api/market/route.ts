import { getMarket } from '@/lib/market';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const m = getMarket();
  return Response.json({
    items: m.items,
    oracle: m.oracle,
    buyers: m.buyers.map(({ id, shopName, persona }) => ({ id, shopName, persona })),
    sellers: m.sellers.map(({ id, warehouseName, persona }) => ({ id, warehouseName, persona })),
    negotiations: [...m.negotiations.values()],
  });
}
