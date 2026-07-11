import { config } from 'dotenv';
config({ path: '.env.local' });
import { getEventLog } from '../src/lib/eventlog';
import { getMarket } from '../src/lib/market';
import { runNegotiation } from '../src/lib/runner';

async function main(): Promise<void> {
  const market = getMarket();
  const itemIds = market.items.slice(0, 4).map((i) => i.id);
  const neg = {
    id: `smoke-${Date.now().toString(36)}`,
    buyerId: market.buyers[0].id,
    sellerId: market.sellers[0].id,
    bundleItemIds: itemIds,
    turn: 'buyer' as const,
    status: 'active' as const,
    round: 0,
    roundCap: 8,
    control: { buyer: 'agent' as const, seller: 'agent' as const },
  };
  market.negotiations.set(neg.id, neg);
  getEventLog().subscribe((e) => console.log(`[${e.visibility}] ${e.type}:`, JSON.stringify(e.payload)));
  await runNegotiation(neg.id);
  console.log('final:', market.negotiations.get(neg.id)?.status, market.negotiations.get(neg.id)?.agreedPrice);
}

main().catch((e) => { console.error(e); process.exit(1); });
