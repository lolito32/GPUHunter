import { init, flush, getAllProducts, getTargets } from './store.js';
import { runSync } from './services/sync.js';
import { formatARS } from './lib/price.js';

init();

const result = await runSync('manual');
const products = Object.values(getAllProducts());
const targets = getTargets();
const under = products.filter((p) => targets[p.gpu] && p.price <= targets[p.gpu]);

console.log(`productos: ${products.length} (${under.length} bajo objetivo)`);
console.log(`agregados: ${result.added} · cambios: ${result.changed} · alertas: ${result.alerts}`);
if (result.alertInfo && result.alertInfo.sent === 0 && result.alertInfo.reason) {
  console.log(`alertas: ${result.alertInfo.reason}`);
}
for (const [key, info] of Object.entries(result.stores)) {
  console.log(`  ${info.ok ? 'ok ' : 'ERR'} ${key.padEnd(13)} ${String(info.items).padStart(4)} items ${info.ms}ms ${info.error}`);
}
const cheapest = [...under].sort((a, b) => a.price - b.price).slice(0, 10);
if (cheapest.length) {
  console.log('mejores bajo objetivo:');
  for (const p of cheapest) console.log(`  ${formatARS(p.price).padStart(12)}  ${p.gpu.padEnd(12)} ${p.store.padEnd(13)} ${p.name}`);
}
flush();
