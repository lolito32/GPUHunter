let currentChart = null;

function showProductDetail(item) {
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('product-modal-title');
  const body = document.getElementById('product-modal-body');
  if (!modal || !title || !body) return;
  title.textContent = item.nm || item.name || '';
  body.innerHTML = `
    <div class="metrics">
      <div class="metric"><div class="m-label">Precio Mínimo Histórico</div><div class="m-value" id="m-min">-</div></div>
      <div class="metric"><div class="m-label">Precio Promedio</div><div class="m-value" id="m-avg">-</div></div>
      <div class="metric"><div class="m-label">Variación % Últimos 30 días</div><div class="m-value" id="m-var">-</div></div>
    </div>
    <canvas id="price-chart" width="400" height="200"></canvas>
  `;
  modal.classList.remove('hidden');
  loadProductHistory(item);
}

async function loadProductHistory(item) {
  const id = item.id || item.ur || (item.st + ':' + item.nm);
  try {
    const res = await fetch((window.apiBase ? window.apiBase() : '') + '/api/products/' + encodeURIComponent(id) + '/history');
    const history = await res.json();
    renderProductChart(history);
    renderProductStats(history);
  } catch (e) {
    const ctx = document.getElementById('price-chart');
    if (ctx) {
      ctx.replaceWith(document.createTextNode('Error al cargar historial'));
    }
  }
}

function renderProductStats(history) {
  const minEl = document.getElementById('m-min');
  const avgEl = document.getElementById('m-avg');
  const varEl = document.getElementById('m-var');
  if (!history || history.length === 0) return;
  const prices = history.map(h => Number(h.price)).filter(n => Number.isFinite(n));
  if (prices.length === 0) return;
  const min = Math.min(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (minEl) minEl.textContent = (window.money ? window.money(min) : '$' + Math.round(min));
  if (avgEl) avgEl.textContent = (window.money ? window.money(Math.round(avg)) : '$' + Math.round(avg));
  const now = Date.now();
  const thirty = 30 * 24 * 3600 * 1000;
  const recent = history.filter(h => {
    const t = new Date(h.recorded_at || h.recordedAt || h.t || 0).getTime();
    return !isNaN(t) && now - t <= thirty;
  });
  if (recent.length >= 2) {
    const first = recent[0].price;
    const last = recent[recent.length - 1].price;
    const pct = ((last - first) / first) * 100;
    if (varEl) varEl.textContent = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
  } else if (prices.length >= 2) {
    const first = prices[0];
    const last = prices[prices.length - 1];
    const pct = ((last - first) / first) * 100;
    if (varEl) varEl.textContent = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
  }
}

function renderProductChart(history) {
  const canvas = document.getElementById('price-chart');
  if (!canvas) return;
  if (currentChart) { try { currentChart.destroy(); } catch (e) {} currentChart = null; }
  const labels = (history || []).map(h => {
    const d = new Date(h.recorded_at || h.recordedAt || h.t || 0);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  });
  const data = (history || []).map(h => Number(h.price));
  const ctx = canvas.getContext('2d');
  if (typeof Chart === 'undefined') return;
  currentChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Precio ARS', data, tension: 0.2, borderWidth: 1.5 }] },
    options: {
      responsive: true,
      scales: { y: { ticks: { callback: v => (window.money ? window.money(v) : '$' + v) } } },
      plugins: { legend: { display: false } }
    }
  });
}

function closeProductModal() {
  const modal = document.getElementById('product-modal');
  if (modal) modal.classList.add('hidden');
  if (currentChart) { try { currentChart.destroy(); } catch (e) {} currentChart = null; }
}
