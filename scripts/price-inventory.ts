import { config } from 'dotenv';
config({ path: '.env.local' });
import path from 'node:path';
import fs from 'node:fs';
import { priceInventory } from '../src/lib/oracle';
import type { Comp, Item } from '../src/lib/types';

async function main(): Promise<void> {
  const items = JSON.parse(fs.readFileSync('data/inventory.json', 'utf8')) as Item[];
  const comps = JSON.parse(fs.readFileSync('data/comps.json', 'utf8')) as Comp[];
  const cache = await priceInventory(items, comps, path.join(process.cwd(), 'data', 'oracle-cache.json'));
  console.log(`oracle cache complete: ${Object.keys(cache).length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
