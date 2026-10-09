import { init, seedHistory, flush, getHistory } from './store.js';
import { backfillHistory } from './services/historyBackfill.js';

init();

const { entries, models, points } = await backfillHistory({});
const added = seedHistory(entries);
flush();

const total = Object.values(getHistory()).reduce(
  (n, arr) => n + (Array.isArray(arr) ? arr.length : 0),
  0
);

console.log(`[backfill] modelos: ${models} | puntos obtenidos: ${points} | nuevos: ${added} | total historial: ${total}`);
for (const [gpu, arr] of Object.entries(entries)) {
  const first = arr[0];
  const last = arr[arr.length - 1];
  console.log(`  ${gpu}: ${arr.length} pts (${first.d} -> ${last.d}) $${last.p}`);
}
