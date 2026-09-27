'use strict';

/* =========================================================
   Meu Progresso — acompanhamento semanal de peso e medidas
   ========================================================= */

const STORE_KEY = 'meuprogresso.v1';
const META_CACHE = 'meuprogresso-meta';
const APP_VERSION = '1.0';

const MEASURES = [
  { key: 'waist', label: 'Cintura', short: 'Cint.', color: 'var(--c-waist)', lowerIsBetter: true },
  { key: 'hip',   label: 'Quadril', short: 'Quad.', color: 'var(--c-hip)',   lowerIsBetter: true },
  { key: 'thigh', label: 'Coxa',    short: 'Coxa',  color: 'var(--c-thigh)', lowerIsBetter: true },
  { key: 'arm',   label: 'Braço',   short: 'Braço', color: 'var(--c-arm)',   lowerIsBetter: null },
];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const ICAL_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const SEED = {
  version: 1,
  settings: { height: 1.80, sex: 'M', goal: null, weighDay: 5, reminder: false },
  entries: [
    { date: '2026-08-07', weight: 112 },
    { date: '2026-08-14', weight: 108.8 },
    { date: '2026-08-21', weight: 107.6 },
    { date: '2026-08-28', weight: 106.5 },
    { date: '2026-09-04', weight: 105.75, waist: 121, hip: 111, thigh: 64, arm: 38 },
    { date: '2026-09-11', weight: 103.5,  waist: 117, hip: 109, thigh: 61, arm: 39 },
    { date: '2026-09-18', weight: 103.25, waist: 115, hip: 108, thigh: 61, arm: 40 },
  ],
};

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const isNum = v => typeof v === 'number' && isFinite(v);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isoD = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const todayIso = () => isoD(new Date());
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
const fmtDate = (s, opts = { day: '2-digit', month: '2-digit' }) => parseD(s).toLocaleDateString('pt-BR', opts);
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

const nf = (n, min = 0, max = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
const kg = n => nf(n, 1, 2);
const cm = n => nf(n, 0, 1);
const pct = n => nf(n, 2, 2) + '%';
const signed = (n, f) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n));
const parseNum = v => {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : NaN;
};
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/* ---------- Estado ---------- */
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.entries)) return normalize(d);
    }
  } catch (e) { /* armazenamento indisponível */ }
  return clone(SEED);
}
function normalize(d) {
  d.settings = Object.assign({}, SEED.settings, d.settings || {});
  d.entries = d.entries.filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date)).sort(byDate);
  return d;
}
function save() {
  state.entries.sort(byDate);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Não foi possível salvar neste navegador.'); }
  syncSwMeta();
}

/* ---------- Cálculos ---------- */
function weightStats() {
  const w = state.entries.filter(e => isNum(e.weight));
  if (!w.length) return null;
  const first = w[0], last = w[w.length - 1], prev = w.length > 1 ? w[w.length - 2] : null;
  const loss = first.weight - last.weight;
  const lossPct = loss / first.weight * 100;
  const days = daysBetween(first.date, last.date);
  const weeks = days / 7;
  const avg = weeks > 0 ? loss / weeks : 0;
  const goal = isNum(state.settings.goal) ? state.settings.goal : null;
  let goalInfo = null;
  if (goal != null) {
    const total = first.weight - goal;
    const done = first.weight - last.weight;
    const progress = total > 0 ? Math.max(0, Math.min(1, done / total)) : (last.weight <= goal ? 1 : 0);
    const remaining = last.weight - goal;
    let eta = null;
    if (remaining > 0 && avg > 0) {
      const wk = remaining / avg;
      const d = parseD(last.date); d.setDate(d.getDate() + Math.round(wk * 7));
      eta = { weeks: wk, date: isoD(d) };
    }
    goalInfo = { goal, progress, remaining, eta };
  }
  return { w, first, last, prev, loss, lossPct, weeks, avg, week: weekOf(last.date, first.date), goalInfo };
}
function weekOf(date, start) {
  start = start || (state.entries.find(e => isNum(e.weight)) || state.entries[0] || {}).date;
  if (!start) return 0;
  return Math.round(daysBetween(start, date) / 7);
}
function measureStats(key) {
  const list = state.entries.filter(e => isNum(e[key]));
  if (!list.length) return null;
  const first = list[0], last = list[list.length - 1];
  return { list, first, last, delta: last[key] - first[key] };
}
function bmi() {
  const s = weightStats(); const h = state.settings.height;
  if (!s || !isNum(h) || h <= 0) return null;
  const v = s.last.weight / (h * h);
  let label, tone;
  if (v < 18.5) { label = 'Abaixo do peso'; tone = 'warn'; }
  else if (v < 25) { label = 'Peso normal'; tone = 'good'; }
  else if (v < 30) { label = 'Sobrepeso'; tone = 'warn'; }
  else if (v < 35) { label = 'Obesidade grau I'; tone = 'bad'; }
  else if (v < 40) { label = 'Obesidade grau II'; tone = 'bad'; }
  else { label = 'Obesidade grau III'; tone = 'bad'; }
  const first = s.first.weight / (h * h);
  return { v, label, tone, first };
}
function whr() {
  const list = state.entries.filter(e => isNum(e.waist) && isNum(e.hip) && e.hip > 0);
  if (!list.length) return null;
  const limit = state.settings.sex === 'F' ? 0.85 : 0.90;
  const last = list[list.length - 1], first = list[0];
  const v = last.waist / last.hip, v0 = first.waist / first.hip;
  return { v, v0, limit, ok: v < limit, list, first, last };
}

/* ---------- Gráficos (SVG) ---------- */
let chartSeq = 0;

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { lo, hi: ticks[ticks.length - 1], ticks };
}

function lineChart(el, opt) {
  const series = opt.series.filter(s => s.points.length);
  if (!series.length) { el.innerHTML = '<p class="chart-empty">Sem dados ainda.</p>'; return; }
  const id = ++chartSeq;
  const compact = !!opt.compact;
  const W = Math.max(el.clientWidth || 320, compact ? 120 : 240);
  const H = opt.height || 220;
  const P = compact ? { l: 28, r: 10, t: 12, b: 22 } : { l: 38, r: 18, t: 18, b: 28 };
  const fmt = opt.format || (v => nf(v, 0, 2));
  const pts = series.flatMap(s => s.points);
  const dates = [...new Set(pts.map(p => p.date))].sort();
  const ts = d => parseD(d).getTime();
  let xMin = ts(dates[0]), xMax = ts(dates[dates.length - 1]);
  if (xMin === xMax) { xMin -= 3 * 864e5; xMax += 3 * 864e5; }
  const ys = pts.map(p => p.y);
  if (isNum(opt.goal)) ys.push(opt.goal);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  const pad = (yMax - yMin) * 0.12 || 1;
  const { lo, hi, ticks } = niceTicks(yMin - pad, yMax + pad, compact ? 3 : 4);
  const X = d => P.l + (ts(d) - xMin) / (xMax - xMin) * (W - P.l - P.r);
  const Y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);

  let svg = `<defs>${series.map((s, i) => `
    <linearGradient id="g${id}-${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:${s.color};stop-opacity:.22"/>
      <stop offset="1" style="stop-color:${s.color};stop-opacity:0"/>
    </linearGradient>`).join('')}</defs>`;

  ticks.forEach(v => {
    svg += `<line class="ch-grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    svg += `<text class="ch-ylab" x="${P.l - 7}" y="${Y(v) + 4}" text-anchor="end">${nf(v, 0, 1)}</text>`;
  });

  const maxLabels = Math.max(2, Math.floor((W - P.l - P.r) / (compact ? 44 : 52)));
  const stepL = Math.ceil(dates.length / maxLabels);
  dates.forEach((d, i) => {
    if ((dates.length - 1 - i) % stepL !== 0) return;
    svg += `<text class="ch-xlab" x="${X(d)}" y="${H - 6}" text-anchor="middle">${fmtDate(d)}</text>`;
  });

  if (isNum(opt.goal)) {
    const gy = Y(opt.goal);
    svg += `<line class="ch-goal" x1="${P.l}" x2="${W - P.r}" y1="${gy}" y2="${gy}"/>`;
    svg += `<text class="ch-goal-lab" x="${W - P.r}" y="${gy - 6}" text-anchor="end">Meta ${kg(opt.goal)}</text>`;
  }

  series.forEach((s, i) => {
    const p = s.points;
    const line = p.map((q, j) => `${j ? 'L' : 'M'}${X(q.date).toFixed(1)},${Y(q.y).toFixed(1)}`).join('');
    if (opt.area !== false && series.length === 1 && p.length > 1) {
      const base = H - P.b;
      svg += `<path d="${line}L${X(p[p.length - 1].date).toFixed(1)},${base}L${X(p[0].date).toFixed(1)},${base}Z" style="fill:url(#g${id}-${i})"/>`;
    }
    svg += `<path class="ch-line" d="${line}" style="stroke:${s.color}"/>`;
    p.forEach((q, j) => {
      const lastPt = j === p.length - 1;
      svg += `<circle class="ch-dot" cx="${X(q.date)}" cy="${Y(q.y)}" r="${lastPt ? 5 : (compact ? 3 : 3.5)}" style="fill:${s.color}"/>`;
    });
    if (opt.labelLast) {
      const q = p[p.length - 1];
      svg += `<text class="ch-val" x="${X(q.date)}" y="${Y(q.y) - 11}" text-anchor="${p.length > 1 ? 'end' : 'middle'}" style="fill:${s.color}">${fmt(q.y)}</text>`;
    }
  });

  svg += `<line class="ch-cursor" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}"/>`;

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(opt.label || 'Gráfico')}">${svg}</svg><div class="ch-tip" hidden></div>`;

  const svgEl = $('svg', el), tip = $('.ch-tip', el), cursor = $('.ch-cursor', el);
  const show = ev => {
    const r = svgEl.getBoundingClientRect();
    const x = (ev.clientX - r.left) * (W / r.width);
    let best = dates[0], bd = Infinity;
    dates.forEach(d => { const dd = Math.abs(X(d) - x); if (dd < bd) { bd = dd; best = d; } });
    const cx = X(best);
    cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.style.opacity = 1;
    const rows = series.map(s => {
      const q = s.points.find(p => p.date === best);
      return q ? `<div><span class="sw" style="background:${s.color}"></span>${series.length > 1 ? esc(s.name) + ': ' : ''}<b>${fmt(q.y)}</b></div>` : '';
    }).join('');
    tip.innerHTML = `<div style="opacity:.7;margin-bottom:2px">${fmtDate(best, { day: '2-digit', month: 'short' })}${opt.weekLabel ? ' · Semana ' + weekOf(best) : ''}</div>${rows}`;
    tip.hidden = false;
    const px = cx / W * r.width;
    const half = tip.offsetWidth / 2;
    tip.style.left = Math.max(half, Math.min(r.width - half, px)) + 'px';
    tip.style.top = (compact ? -8 : -6) - tip.offsetHeight + 'px';
  };
  const hide = () => { tip.hidden = true; cursor.style.opacity = 0; };
  svgEl.addEventListener('pointermove', show);
  svgEl.addEventListener('pointerdown', show);
  svgEl.addEventListener('pointerleave', hide);
}

function barChart(el, opt) {
  const bars = opt.bars;
  if (!bars.length) { el.innerHTML = '<p class="chart-empty">São necessárias pelo menos duas pesagens.</p>'; return; }
  const W = Math.max(el.clientWidth || 320, 240), H = opt.height || 180;
  const P = { l: 38, r: 10, t: 22, b: 26 };
  const vals = bars.map(b => b.v);
  let mn = Math.min(0, ...vals), mx = Math.max(0, ...vals);
  const pad = (mx - mn) * 0.15 || 1;
  const { lo, hi, ticks } = niceTicks(mn - (mn < 0 ? pad : 0), mx + (mx > 0 ? pad : 0), 3);
  const Y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const slot = (W - P.l - P.r) / bars.length;
  const bw = Math.min(34, slot * 0.58);
  let svg = '';
  ticks.forEach(v => {
    svg += `<line class="ch-grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    svg += `<text class="ch-ylab" x="${P.l - 7}" y="${Y(v) + 4}" text-anchor="end">${nf(v, 0, 1)}</text>`;
  });
  bars.forEach((b, i) => {
    const cx = P.l + slot * i + slot / 2;
    const y0 = Y(0), y1 = Y(b.v);
    const top = Math.min(y0, y1), h = Math.max(2, Math.abs(y1 - y0));
    const color = b.v < 0 ? 'var(--good)' : b.v > 0 ? 'var(--bad)' : 'var(--faint)';
    svg += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="6" style="fill:${color}"/>`;
    const ty = b.v < 0 ? top + h + 13 : top - 5;
    if (slot > 30) svg += `<text class="ch-val" x="${cx}" y="${ty}" text-anchor="middle" style="fill:${color}">${signed(b.v, v => nf(v, 1, 2))}</text>`;
    svg += `<text class="ch-xlab" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  svg += `<line class="ch-zero" x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(opt.label || 'Gráfico de barras')}">${svg}</svg>`;
}

/* ---------- Componentes ---------- */
const ICONS = {
  scale: '<svg viewBox="0 0 24 24"><path d="M3 6l6 6 4-4 8 8"/><path d="M21 10v6h-6"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  ruler: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="2.5"/><path d="M6.5 7v3.5M10.5 7v5M14.5 7v3.5M18.5 7v5"/></svg>',
};

const stat = (label, value, sub, tone = '') =>
  `<div class="stat card"><span class="stat-label">${label}</span><b class="stat-value num ${tone}">${value}</b>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;

function deltaTone(delta, lowerIsBetter) {
  if (!delta || lowerIsBetter == null) return '';
  return (delta < 0) === lowerIsBetter ? 'good' : 'bad';
}

function reminderBanner() {
  const set = state.settings;
  const today = todayIso();
  if (new Date().getDay() !== set.weighDay) return '';
  if (state.entries.some(e => e.date === today)) return '';
  return `<div class="banner">
    <div class="banner-icon">${ICONS.bell}</div>
    <div><b>Hoje é dia de pesagem</b><span>Registre seu peso e suas medidas.</span></div>
    <button class="btn btn-primary btn-sm" data-action="add">Registrar</button>
  </div>`;
}

function emptyState(title, text) {
  return `<div class="card empty">
    <div class="empty-icon">${ICONS.scale}</div>
    <h2>${title}</h2><p>${text}</p>
    <button class="btn btn-primary" data-action="add">Adicionar registro</button>
  </div>`;
}

/* ---------- Telas ---------- */
const after = [];

function viewHome() {
  const s = weightStats();
  const head = `<header class="page-head">
      <div><p class="eyebrow">${capital(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h1>Meu progresso</h1></div>
      ${s ? `<span class="chip">Semana ${s.week}</span>` : ''}
    </header>`;
  if (!s) return head + emptyState('Comece seu acompanhamento', 'Registre seu primeiro peso. Ele será a semana zero.');

  const gi = s.goalInfo;
  const lost = s.loss >= 0;
  const hero = `<section class="card hero">
    <div class="hero-top"><span>${lost ? 'Perda total' : 'Ganho total'}</span><span class="hero-since">desde ${fmtDate(s.first.date)} · semana 0</span></div>
    <div class="hero-value num">${lost ? '−' : '+'}${kg(Math.abs(s.loss))}<small>kg</small></div>
    <div class="hero-pct num">${lost ? '−' : '+'}${pct(Math.abs(s.lossPct))} do peso inicial</div>
    <div class="hero-row">
      <div><span>Inicial</span><b class="num">${kg(s.first.weight)} kg</b></div>
      <div><span>Atual</span><b class="num">${kg(s.last.weight)} kg</b></div>
      <div><span>Meta</span><b class="num">${gi ? kg(gi.goal) + ' kg' : '<a href="#ajustes">Definir</a>'}</b></div>
    </div>
    ${gi ? `<div class="progress">
      <div class="progress-bar"><i style="width:${(gi.progress * 100).toFixed(1)}%"></i></div>
      <div class="progress-meta"><span>${nf(gi.progress * 100, 0, 0)}% da meta</span><span>${gi.remaining > 0 ? `Faltam ${kg(gi.remaining)} kg` : 'Meta atingida!'}</span></div>
    </div>` : ''}
  </section>`;

  const b = bmi(), r = whr();
  const lastDelta = s.prev ? s.last.weight - s.prev.weight : null;
  const stats = `<section class="stats">
    ${stat('Última semana', lastDelta == null ? '—' : signed(lastDelta, kg) + ' kg', s.prev ? `${fmtDate(s.prev.date)} → ${fmtDate(s.last.date)}` : 'Primeira pesagem', deltaTone(lastDelta, true))}
    ${stat('Média semanal', s.weeks > 0 ? signed(-s.avg, kg) + ' kg' : '—', s.weeks > 0 ? `em ${nf(s.weeks, 0, 1)} semanas` : 'Aguardando dados', s.avg > 0 ? 'good' : s.avg < 0 ? 'bad' : '')}
    ${b ? stat('IMC', nf(b.v, 1, 1), `<span class="tag ${b.tone}">${b.label}</span>`) : stat('IMC', '—', '<a href="#ajustes">Informe sua altura</a>')}
    ${r ? stat('Cintura/quadril', nf(r.v, 2, 2), `<span class="tag ${r.ok ? 'good' : 'bad'}">${r.ok ? 'Dentro da referência' : 'Acima de ' + nf(r.limit, 2, 2)}</span>`) : stat('Cintura/quadril', '—', 'Registre cintura e quadril')}
  </section>`;

  const chart = `<section class="card">
    <div class="card-head"><h2>Evolução do peso</h2><a href="#peso" class="link">Detalhes</a></div>
    <div class="chart" id="ch-home"></div>
  </section>`;
  after.push(() => lineChart($('#ch-home'), {
    series: [{ name: 'Peso', color: 'var(--primary)', points: s.w.map(e => ({ date: e.date, y: e.weight })) }],
    goal: null, height: 210, format: v => kg(v) + ' kg', weekLabel: true, labelLast: true, label: 'Evolução do peso',
  }));

  const pills = MEASURES.map(m => {
    const ms = measureStats(m.key);
    if (!ms) return `<div class="m-pill"><span><i style="background:${m.color}"></i>${m.label}</span><b>—</b><em>&nbsp;</em></div>`;
    const tone = deltaTone(ms.delta, m.lowerIsBetter);
    return `<div class="m-pill"><span><i style="background:${m.color}"></i>${m.label}</span>
      <b class="num">${cm(ms.last[m.key])} cm</b>
      <em class="num ${tone}" style="${tone ? '' : 'color:var(--muted)'}">${ms.list.length > 1 ? signed(ms.delta, cm) + ' cm' : 'início'}</em></div>`;
  }).join('');
  const firstM = MEASURES.map(m => measureStats(m.key)).filter(Boolean).map(x => x.first.date).sort()[0];
  const measures = `<section class="card">
    <div class="card-head"><h2>Medidas</h2><a href="#medidas" class="link">Detalhes</a></div>
    ${firstM ? `<p class="card-sub">Variação desde ${fmtDate(firstM)}</p>` : ''}
    <div class="m-summary">${pills}</div>
  </section>`;

  return head + reminderBanner() + hero + stats + chart + measures;
}

function viewWeight() {
  const s = weightStats();
  const head = `<header class="page-head"><div><p class="eyebrow">Acompanhamento semanal</p><h1>Peso</h1></div>
    ${s ? `<span class="chip">${signed(-s.loss, kg)} kg · ${signed(-s.lossPct, pct)}</span>` : ''}</header>`;
  if (!s) return head + emptyState('Nenhuma pesagem ainda', 'Adicione sua primeira pesagem para ver os gráficos.');

  const gi = s.goalInfo;
  const bars = s.w.slice(1).map((e, i) => ({ label: 'S' + weekOf(e.date), v: e.weight - s.w[i].weight }));
  const best = bars.length ? bars.reduce((a, b) => (b.v < a.v ? b : a)) : null;

  after.push(() => {
    lineChart($('#ch-weight'), {
      series: [{ name: 'Peso', color: 'var(--primary)', points: s.w.map(e => ({ date: e.date, y: e.weight })) }],
      goal: gi ? gi.goal : null, height: 240, format: v => kg(v) + ' kg', weekLabel: true, labelLast: true, label: 'Peso ao longo do tempo',
    });
    barChart($('#ch-bars'), { bars, height: 190, label: 'Variação semanal de peso' });
  });

  const rows = s.w.slice().reverse().map((e, i, arr) => {
    const prev = arr[i + 1];
    const d = prev ? e.weight - prev.weight : null;
    const fromStart = e.weight - s.first.weight;
    const dt = parseD(e.date);
    return `<button class="row" data-edit="${e.date}">
      <div class="row-badge"><div><b>${dt.getDate()}</b><span>${dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div></div>
      <div class="row-main"><b>Semana ${weekOf(e.date)}</b><span>${dt.getDay() !== state.settings.weighDay ? capital(WEEKDAYS[dt.getDay()].split('-')[0]) + ' · ' : ''}${e.date === s.first.date ? 'Peso inicial' : 'Total: ' + signed(fromStart, kg) + ' kg'}</span></div>
      <div class="row-end"><b class="num">${kg(e.weight)} kg</b><span class="num ${deltaTone(d, true)}">${d == null ? '—' : signed(d, kg)}</span></div>
    </button>`;
  }).join('');

  return head + `
    <section class="stats">
      ${stat('Perda total', kg(Math.max(0, s.loss)) + ' kg', `${pct(s.lossPct)} do peso inicial`, s.loss > 0 ? 'good' : '')}
      ${stat('Peso atual', kg(s.last.weight) + ' kg', `Semana ${s.week} · ${fmtDate(s.last.date)}`)}
      ${stat('Maior perda semanal', best && best.v < 0 ? kg(-best.v) + ' kg' : '—', best && best.v < 0 ? 'na semana ' + best.label.slice(1) : 'Aguardando dados', best && best.v < 0 ? 'good' : '')}
      ${gi ? stat('Previsão da meta', gi.remaining <= 0 ? 'Atingida' : gi.eta ? fmtDate(gi.eta.date, { day: '2-digit', month: 'short' }) : '—', gi.remaining <= 0 ? 'Parabéns!' : gi.eta ? `≈ ${nf(Math.ceil(gi.eta.weeks), 0)} semanas no ritmo atual` : 'Sem ritmo de perda', gi.remaining <= 0 ? 'good' : '')
            : stat('Previsão da meta', '—', '<a href="#ajustes">Definir meta</a>')}
    </section>
    <section class="card">
      <div class="card-head"><h2>Peso ao longo do tempo</h2></div>
      <div class="chart" id="ch-weight"></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Variação por semana</h2></div>
      <p class="card-sub">Em kg, comparada à pesagem anterior</p>
      <div class="chart" id="ch-bars"></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Histórico</h2><span class="stat-sub">Toque para editar</span></div>
      <div class="list">${rows}</div>
    </section>`;
}

function viewMeasures() {
  const head = `<header class="page-head"><div><p class="eyebrow">Circunferências em cm</p><h1>Medidas</h1></div></header>`;
  const withM = state.entries.filter(e => MEASURES.some(m => isNum(e[m.key])));
  if (!withM.length) return head + emptyState('Nenhuma medida ainda', 'Registre cintura, quadril, coxa e braço para acompanhar a evolução.');

  const r = whr();
  const whrCard = r ? `<section class="card">
    <div class="card-head"><h2>Relação cintura/quadril</h2><span class="tag ${r.ok ? 'good' : 'bad'}" style="white-space:nowrap">${r.ok ? 'Adequada' : 'Acima de ' + nf(r.limit, 2, 2)}</span></div>
    <div style="display:flex;align-items:baseline;gap:10px">
      <b class="num" style="font-size:34px;font-weight:800;letter-spacing:-.02em">${nf(r.v, 2, 2)}</b>
      ${r.list.length > 1 ? `<span class="num ${deltaTone(r.v - r.v0, true)}" style="font-weight:650">${signed(r.v - r.v0, v => nf(v, 2, 2))} desde ${fmtDate(r.first.date)}</span>` : ''}
    </div>
    <p class="card-sub" style="margin:6px 0 0">Referência OMS (${state.settings.sex === 'F' ? 'mulheres' : 'homens'}): abaixo de ${nf(r.limit, 2, 2)}</p>
  </section>` : '';

  const cards = MEASURES.map(m => {
    const ms = measureStats(m.key);
    if (!ms) return `<div class="card m-card"><div class="m-card-head"><i style="background:${m.color}"></i>${m.label}</div><div class="m-card-val">—</div><p class="chart-empty" style="padding:18px 0">Sem registros</p></div>`;
    const tone = deltaTone(ms.delta, m.lowerIsBetter);
    after.push(() => lineChart($('#ch-m-' + m.key), {
      series: [{ name: m.label, color: m.color, points: ms.list.map(e => ({ date: e.date, y: e[m.key] })) }],
      height: 120, compact: true, format: v => cm(v) + ' cm', label: m.label,
    }));
    return `<div class="card m-card">
      <div class="m-card-head"><i style="background:${m.color}"></i>${m.label}</div>
      <div class="m-card-val num">${cm(ms.last[m.key])}<small>cm</small></div>
      <div class="m-card-delta num ${tone}" style="${tone ? '' : 'color:var(--muted)'}">${ms.list.length > 1 ? `${signed(ms.delta, cm)} cm desde ${fmtDate(ms.first.date)}` : 'Primeira medição'}</div>
      <div class="chart" id="ch-m-${m.key}"></div>
    </div>`;
  }).join('');

  // Variação acumulada de todas as medidas num único gráfico
  const deltaSeries = MEASURES.map(m => {
    const ms = measureStats(m.key);
    return { name: m.label, color: m.color, points: ms ? ms.list.map(e => ({ date: e.date, y: e[m.key] - ms.first[m.key] })) : [] };
  });
  after.push(() => lineChart($('#ch-m-all'), {
    series: deltaSeries, height: 220, format: v => signed(v, cm) + ' cm', weekLabel: true, label: 'Variação acumulada das medidas',
  }));

  const rows = withM.slice().reverse().map(e => `<tr data-edit="${e.date}">
      <td>${fmtDate(e.date)}<span class="sub">Semana ${weekOf(e.date)}</span></td>
      ${MEASURES.map(m => `<td>${isNum(e[m.key]) ? cm(e[m.key]) : '—'}</td>`).join('')}
    </tr>`).join('');
  const foot = MEASURES.map(m => {
    const ms = measureStats(m.key);
    if (!ms || ms.list.length < 2) return '<td>—</td>';
    return `<td class="${deltaTone(ms.delta, m.lowerIsBetter)}">${signed(ms.delta, cm)}</td>`;
  }).join('');

  return head + whrCard + `<div class="m-grid">${cards}</div>
    <section class="card">
      <div class="card-head"><h2>Variação acumulada</h2></div>
      <p class="card-sub">Diferença em cm desde a primeira medição</p>
      <div class="chart" id="ch-m-all"></div>
      <div class="legend">${MEASURES.map(m => `<span><i style="background:${m.color}"></i>${m.label}</span>`).join('')}</div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Histórico</h2><span class="stat-sub">Toque para editar</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Data</th>${MEASURES.map(m => `<th>${m.short}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Variação</td>${foot}</tr></tfoot>
      </table></div>
    </section>`;
}

function viewSettings() {
  const set = state.settings;
  const s = weightStats();
  const gi = s && s.goalInfo;
  const notifSupported = 'Notification' in window;
  let reminderNote = 'Aviso no celular no dia da pesagem, se você ainda não registrou.';
  if (!notifSupported) reminderNote = 'Este navegador não permite notificações.';
  else if (set.reminder && Notification.permission !== 'granted') reminderNote = 'Permissão de notificação bloqueada. Libere nas configurações do navegador.';

  return `<header class="page-head"><div><p class="eyebrow">Preferências</p><h1>Ajustes</h1></div></header>

  <h2 class="group-title">Perfil</h2>
  <section class="card group">
    <label class="set-row"><span>Altura<small>Usada no cálculo do IMC</small></span>
      <div class="input-unit"><input id="set-height" inputmode="decimal" value="${isNum(set.height) ? nf(set.height, 2, 2) : ''}" placeholder="1,80"><em>m</em></div></label>
    <div class="set-row"><span>Referência<small>Faixa da relação cintura/quadril</small></span>
      <div class="seg" role="group"><button type="button" data-sex="M" class="${set.sex !== 'F' ? 'on' : ''}">Masculino</button><button type="button" data-sex="F" class="${set.sex === 'F' ? 'on' : ''}">Feminino</button></div></div>
  </section>

  <h2 class="group-title">Meta</h2>
  <section class="card group">
    <label class="set-row"><span>Meta de peso<small>${gi ? (gi.remaining > 0 ? `Faltam ${kg(gi.remaining)} kg` : 'Meta atingida!') : 'Opcional'}</small></span>
      <div class="input-unit"><input id="set-goal" inputmode="decimal" value="${isNum(set.goal) ? nf(set.goal, 0, 2) : ''}" placeholder="—"><em>kg</em></div></label>
  </section>

  <h2 class="group-title">Pesagem semanal</h2>
  <section class="card group">
    <label class="set-row"><span>Dia da pesagem</span>
      <select id="set-day">${WEEKDAYS.map((d, i) => `<option value="${i}" ${i === set.weighDay ? 'selected' : ''}>${capital(d)}</option>`).join('')}</select></label>
    <div class="set-row"><span>Lembrete no celular<small>${reminderNote}</small></span>
      <label class="switch"><input type="checkbox" id="set-reminder" ${set.reminder && notifSupported ? 'checked' : ''} ${notifSupported ? '' : 'disabled'} aria-label="Lembrete no celular"><i></i></label></div>
    <button type="button" class="set-row" id="btn-ics"><span>Adicionar lembrete à agenda<small>Evento semanal toda ${WEEKDAYS[set.weighDay]}, às 7h</small></span><span class="chev">›</span></button>
  </section>

  <h2 class="group-title">Dados</h2>
  <section class="card group">
    <button type="button" class="set-row" id="btn-export"><span>Exportar backup<small>Arquivo .json com todos os registros</small></span><span class="chev">›</span></button>
    <button type="button" class="set-row" id="btn-csv"><span>Exportar planilha<small>Arquivo .csv para Excel ou Planilhas Google</small></span><span class="chev">›</span></button>
    <button type="button" class="set-row" id="btn-import"><span>Importar backup<small>Substitui os dados atuais</small></span><span class="chev">›</span></button>
    <button type="button" class="set-row danger" id="btn-wipe"><span>Apagar todos os dados</span><span class="chev">›</span></button>
  </section>
  <p class="set-note">Seus dados ficam guardados só neste aparelho. Exporte um backup de vez em quando.</p>
  <p class="about">Meu Progresso · versão ${APP_VERSION} · ${state.entries.length} registros</p>`;
}

/* ---------- Roteamento ---------- */
const ROUTES = { inicio: viewHome, peso: viewWeight, medidas: viewMeasures, ajustes: viewSettings };
let currentRoute = null;

function render() {
  const route = (location.hash || '#inicio').slice(1);
  const view = ROUTES[route] ? route : 'inicio';
  after.length = 0;
  const el = $('#view');
  const changed = view !== currentRoute;
  el.innerHTML = ROUTES[view]();
  if (changed) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; window.scrollTo(0, 0); }
  currentRoute = view;
  $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === view));
  after.forEach(fn => fn());
  if (view === 'ajustes') bindSettings();
}

/* ---------- Formulário de registro ---------- */
function openSheet(date) {
  const root = $('#sheet-root');
  const original = date && state.entries.find(e => e.date === date) ? date : null;
  const initial = date || todayIso();
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <form class="sheet" id="entry-form" novalidate autocomplete="off">
      <div class="sheet-grip"></div>
      <div class="sheet-head"><h2 id="sheet-title">Novo registro</h2><button type="button" class="icon-btn" data-close aria-label="Fechar">${ICONS.close}</button></div>
      <label class="field"><span>Data</span><input type="date" name="date" value="${initial}" required></label>
      <p class="hint" id="date-hint"></p>
      <label class="field field-lg"><span>Peso</span><div class="input-unit"><input name="weight" inputmode="decimal" placeholder="0,0" enterkeyhint="next"><em>kg</em></div></label>
      <details class="measures-box" id="measures-box">
        <summary><div>Medidas<span>(opcional)</span></div></summary>
        <div class="grid-2">${MEASURES.map(m => `<label class="field"><span>${m.label}</span><div class="input-unit"><input name="${m.key}" inputmode="decimal" placeholder="0"><em>cm</em></div></label>`).join('')}</div>
      </details>
      <p class="form-error" id="form-error"></p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-danger-ghost" data-delete hidden>Excluir</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>`;
  const form = $('#entry-form');
  const fill = d => {
    const e = state.entries.find(x => x.date === d);
    form.weight.value = e && isNum(e.weight) ? nf(e.weight, 0, 2) : '';
    MEASURES.forEach(m => { form[m.key].value = e && isNum(e[m.key]) ? nf(e[m.key], 0, 1) : ''; });
    $('#sheet-title').textContent = e ? 'Editar registro' : 'Novo registro';
    $('[data-delete]', form).hidden = !e;
    const hasM = e && MEASURES.some(m => isNum(e[m.key]));
    if (hasM) $('#measures-box').open = true;
    const hint = $('#date-hint');
    if (d) {
      const dt = parseD(d);
      const wd = state.settings.weighDay;
      const start = (state.entries.find(x => isNum(x.weight)) || {}).date;
      const wk = start && d >= start ? ` · semana ${weekOf(d)}` : '';
      hint.className = 'hint';
      hint.style.color = '';
      if (dt.getDay() !== wd) {
        hint.classList.add('warn');
        hint.textContent = `Atenção: essa data é ${WEEKDAYS[dt.getDay()]}; seu dia de pesagem é ${WEEKDAYS[wd]}.`;
      } else {
        hint.style.color = 'var(--muted)';
        hint.textContent = capital(WEEKDAYS[dt.getDay()]) + wk;
      }
    }
  };
  fill(initial);
  if (!original && new Date().getDay() === state.settings.weighDay) $('#measures-box').open = true;
  form.date.addEventListener('change', () => fill(form.date.value));
  setTimeout(() => { if (!original) form.weight.focus(); }, 320);

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const err = $('#form-error');
    const d = form.date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { err.textContent = 'Informe uma data válida.'; return; }
    const entry = { date: d };
    const w = parseNum(form.weight.value);
    if (w !== null) {
      if (!(w >= 20 && w <= 400)) { err.textContent = 'Peso inválido. Use valores entre 20 e 400 kg.'; return; }
      entry.weight = Math.round(w * 100) / 100;
    }
    for (const m of MEASURES) {
      const v = parseNum(form[m.key].value);
      if (v === null) continue;
      if (!(v >= 10 && v <= 300)) { err.textContent = `${m.label} inválida. Use valores entre 10 e 300 cm.`; return; }
      entry[m.key] = Math.round(v * 10) / 10;
    }
    if (Object.keys(entry).length === 1) { err.textContent = 'Preencha o peso ou pelo menos uma medida.'; return; }
    state.entries = state.entries.filter(e => e.date !== d && e.date !== original);
    state.entries.push(entry);
    save();
    closeSheet();
    render();
    const s = weightStats();
    toast(s ? `Salvo! Perda total: ${kg(s.loss)} kg (${pct(s.lossPct)})` : 'Registro salvo!');
  });

  $('[data-delete]', form).addEventListener('click', async () => {
    const d = form.date.value;
    const ok = await confirmBox('Excluir registro?', `O registro de ${fmtDate(d, { day: '2-digit', month: 'long', year: 'numeric' })} será apagado.`, 'Excluir');
    if (!ok) return;
    state.entries = state.entries.filter(e => e.date !== d);
    save(); closeSheet(); render(); toast('Registro excluído.');
  });

  $$('[data-close]', root).forEach(b => b.addEventListener('click', closeSheet));
}

function closeSheet() {
  const root = $('#sheet-root');
  const sheet = $('.sheet', root);
  if (!sheet) return;
  sheet.classList.add('closing');
  const bd = $('.sheet-backdrop', root);
  if (bd) bd.style.opacity = 0;
  setTimeout(() => { root.innerHTML = ''; }, 190);
}

function confirmBox(title, text, okLabel = 'Confirmar') {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="sheet-backdrop dialog-backdrop"></div>
      <div class="dialog" role="alertdialog" aria-modal="true"><h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="dialog-actions"><button class="btn btn-ghost" data-r="0">Cancelar</button><button class="btn btn-danger-ghost" data-r="1">${esc(okLabel)}</button></div></div>`;
    document.body.appendChild(wrap);
    const done = v => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) done(b.dataset.r === '1');
      else if (e.target.classList.contains('dialog-backdrop')) done(false);
    });
  });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- Ajustes ---------- */
function bindSettings() {
  $('#set-height').addEventListener('change', e => {
    const v = parseNum(e.target.value);
    if (v === null) { state.settings.height = null; }
    else {
      const h = v > 3 ? v / 100 : v; // aceita 180 (cm) ou 1,80 (m)
      if (!(h >= 1 && h <= 2.5)) { toast('Altura inválida.'); render(); return; }
      state.settings.height = Math.round(h * 100) / 100;
    }
    save(); render(); toast('Altura salva.');
  });
  $$('[data-sex]').forEach(b => b.addEventListener('click', () => {
    state.settings.sex = b.dataset.sex; save(); render();
  }));
  $('#set-goal').addEventListener('change', e => {
    const v = parseNum(e.target.value);
    if (v === null) state.settings.goal = null;
    else if (!(v >= 30 && v <= 300)) { toast('Meta inválida.'); render(); return; }
    else state.settings.goal = Math.round(v * 100) / 100;
    save(); render(); toast(state.settings.goal ? 'Meta salva.' : 'Meta removida.');
  });
  $('#set-day').addEventListener('change', e => {
    state.settings.weighDay = Number(e.target.value); save(); render();
    if (state.settings.reminder) registerPeriodicSync();
  });
  const rem = $('#set-reminder');
  if (rem) rem.addEventListener('change', async e => {
    const on = e.target.checked;
    const ok = await setReminder(on);
    if (!ok) e.target.checked = false;
    render();
  });
  $('#btn-ics').addEventListener('click', downloadIcs);
  $('#btn-export').addEventListener('click', exportJson);
  $('#btn-csv').addEventListener('click', exportCsv);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#btn-wipe').addEventListener('click', async () => {
    const ok = await confirmBox('Apagar todos os dados?', 'Todos os registros serão removidos deste aparelho. Essa ação não pode ser desfeita. Faça um backup antes.', 'Apagar');
    if (!ok) return;
    state.entries = [];
    save(); render(); toast('Dados apagados.');
  });
}

/* ---------- Backup ---------- */
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function exportJson() {
  const data = Object.assign({ app: 'meu-progresso', exportedAt: new Date().toISOString() }, state);
  download(`meu-progresso-backup-${todayIso()}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('Backup exportado.');
}
function exportCsv() {
  const n = v => (isNum(v) ? String(v).replace('.', ',') : '');
  const lines = ['Data;Semana;Peso (kg);Cintura (cm);Quadril (cm);Coxa (cm);Braço (cm)'];
  state.entries.forEach(e => lines.push([fmtDate(e.date, { day: '2-digit', month: '2-digit', year: 'numeric' }), weekOf(e.date), n(e.weight), ...MEASURES.map(m => n(e[m.key]))].join(';')));
  download(`meu-progresso-${todayIso()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('Planilha exportada.');
}
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.entries)) throw new Error('formato');
    const entries = data.entries.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date)).map(x => {
      const o = { date: x.date };
      ['weight', ...MEASURES.map(m => m.key)].forEach(k => { if (isNum(x[k])) o[k] = x[k]; });
      return o;
    });
    const ok = await confirmBox('Importar backup?', `${entries.length} registros serão carregados e vão substituir os dados atuais.`, 'Importar');
    if (!ok) return;
    state = normalize({ version: 1, settings: data.settings || state.settings, entries });
    save(); render(); toast('Backup importado.');
  } catch (err) {
    toast('Arquivo inválido. Use um backup exportado pelo app.');
  }
});

/* ---------- Lembretes ---------- */
function nextWeekday(wd) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
  return d;
}
function downloadIcs() {
  const wd = state.settings.weighDay;
  const ymd = isoD(nextWeekday(wd)).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meu Progresso//PT-BR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:pesagem-semanal-${Date.now()}@meu-progresso`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd}T070000`,
    `DTEND:${ymd}T071500`,
    `RRULE:FREQ=WEEKLY;BYDAY=${ICAL_DAYS[wd]}`,
    'SUMMARY:Pesagem e medidas',
    'DESCRIPTION:Registrar peso e medidas no app Meu Progresso.',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Hora da pesagem semanal', 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  download('lembrete-pesagem.ics', ics, 'text/calendar');
  toast('Abra o arquivo baixado para adicionar à agenda.');
}

async function getReg() {
  if (!('serviceWorker' in navigator)) return null;
  try { return (await navigator.serviceWorker.getRegistration()) || null; } catch (e) { return null; }
}
async function registerPeriodicSync() {
  const reg = await getReg();
  if (!reg || !('periodicSync' in reg)) return false;
  try {
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state !== 'granted') return false;
    await reg.periodicSync.register('lembrete-semanal', { minInterval: 6 * 60 * 60 * 1000 });
    return true;
  } catch (e) { return false; }
}
async function setReminder(on) {
  if (on) {
    if (!('Notification' in window)) { toast('Este navegador não suporta notificações.'); return false; }
    const p = await Notification.requestPermission();
    if (p !== 'granted') { toast('Permissão de notificação negada.'); state.settings.reminder = false; save(); return false; }
    state.settings.reminder = true; save();
    const bg = await registerPeriodicSync();
    const reg = await getReg();
    if (reg) reg.showNotification('Lembrete ativado', { body: `Você será avisado toda ${WEEKDAYS[state.settings.weighDay]} para registrar seu peso.`, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'lembrete' });
    toast(bg ? 'Lembrete ativado.' : 'Lembrete ativado. Instale o app na tela inicial para receber avisos em segundo plano.');
    return true;
  }
  state.settings.reminder = false; save();
  const reg = await getReg();
  if (reg && 'periodicSync' in reg) { try { await reg.periodicSync.unregister('lembrete-semanal'); } catch (e) { /* ignora */ } }
  toast('Lembrete desativado.');
  return true;
}
async function syncSwMeta() {
  if (!('caches' in window)) return;
  try {
    const c = await caches.open(META_CACHE);
    const old = await c.match('./__meta');
    const prev = old ? await old.json() : {};
    const last = state.entries.length ? state.entries[state.entries.length - 1].date : null;
    const meta = Object.assign(prev, { reminder: !!state.settings.reminder, weighDay: state.settings.weighDay, weighDayName: WEEKDAYS[state.settings.weighDay], lastEntry: last });
    await c.put('./__meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  } catch (e) { /* sem cache disponível */ }
}

/* ---------- Inicialização ---------- */
document.addEventListener('click', e => {
  const add = e.target.closest('[data-action="add"]');
  if (add) { openSheet(); return; }
  const edit = e.target.closest('[data-edit]');
  if (edit) openSheet(edit.dataset.edit);
});
$('#fab').addEventListener('click', () => openSheet());
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
window.addEventListener('hashchange', render);
let resizeTimer, lastW = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastW) return;
  lastW = window.innerWidth;
  clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

render();
save();

const params = new URLSearchParams(location.search);
if (params.has('add')) {
  history.replaceState(null, '', location.pathname + (location.hash || '#inicio'));
  openSheet();
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').then(() => {
    if (state.settings.reminder) registerPeriodicSync();
  }).catch(() => {});
}
