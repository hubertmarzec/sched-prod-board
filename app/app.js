import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = board.querySelector('[data-testid="incident-list"]');
const loader = board.querySelector('[data-testid="loader"]');
const empty = board.querySelector('[data-testid="empty"]');
const status = document.querySelector('[data-role="status"]');
const newBar = board.querySelector('[data-testid="new-bar"]');

const acked = new Set(); // incident ids acked from this board

// R5: the viewer's local time, in the viewer's own order (dd/mm in EU locales).
const timeFmt = new Intl.DateTimeFormat(navigator.languages?.[0] || navigator.language || undefined, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function ackCell(id) {
  return acked.has(id)
    ? `<span data-testid="acked" class="acked">Acked</span>`
    : `<button type="button" data-testid="ack" class="ack">Ack</button>`;
}

function rowHtml(i) {
  return `<li data-testid="incident-row" data-id="${esc(i.id)}" class="row ${esc(i.severity)}">
    <span class="id">${esc(i.id)}</span>
    <span class="sev">${esc(i.severity)}</span>
    <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
    <time datetime="${esc(i.openedAt)}" title="${esc(i.openedAt)}">${esc(timeFmt.format(new Date(i.openedAt)))}</time>
    <span class="act">${ackCell(i.id)}</span>
  </li>`;
}

// R1 (changed by product, 2026-11-14): the list holds still while it is on screen. Rows already shown keep
// their place and are never removed; incidents that arrive later wait in the "N new" bar (R7) and come in,
// newest first, at the top only when on-call clicks the bar.
const shown = new Set(); // ids in the list
let pending = []; // new incidents waiting behind the bar, newest first

function insertTop(incidents, flash) {
  const frag = document.createDocumentFragment();
  for (const i of incidents) {
    if (shown.has(i.id)) continue;
    const tpl = document.createElement('template');
    tpl.innerHTML = rowHtml(i).trim();
    const li = tpl.content.firstChild;
    if (flash) li.classList.add('new');
    frag.append(li);
    shown.add(i.id);
  }
  list.prepend(frag);
}

function render(incidents) {
  loader.remove(); // R3: gone once incidents load
  if (shown.size === 0) {
    // Nothing on screen yet, so nothing can move under a hand: show what there is.
    insertTop(incidents, false);
  } else {
    const waiting = new Set(pending.map((i) => i.id));
    const fresh = incidents.filter((i) => !shown.has(i.id) && !waiting.has(i.id));
    pending = [...fresh, ...pending]; // the feed is newest first
  }
  list.hidden = shown.size === 0;
  empty.hidden = shown.size !== 0;
  showBar();
}

// R7: the "N new" bar. It keeps its space when empty, so its showing up never moves the list.
function showBar() {
  newBar.textContent = pending.length === 1 ? '1 new incident · show' : `${pending.length} new incidents · show`;
  newBar.classList.toggle('on', pending.length > 0);
  newBar.disabled = pending.length === 0;
}

newBar.addEventListener('click', () => {
  if (!pending.length) return;
  insertTop(pending, true);
  pending = [];
  showBar();
});

// R2: Ack acks the incident of the row clicked (by its id), then marks that row acked. Ack stays on the row.
list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const row = btn.closest('[data-testid="incident-row"]');
  const id = row.dataset.id;
  btn.disabled = true;
  btn.textContent = 'Acking…';
  try {
    await ack(id);
    acked.add(id);
    btn.parentElement.innerHTML = ackCell(id);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Ack';
    status.textContent = '· ack failed, try again';
  }
});

// R4: refresh every 2 s while open, one request at a time.
let first = true;
async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    status.textContent = `· updated ${timeFmt.format(new Date(page.updatedAt || Date.now()))}`;
  } catch (err) {
    console.error(err);
    status.textContent = '· offline, retrying';
    if (first) loader.textContent = 'Loading incidents… (retrying)';
  } finally {
    first = false;
    setTimeout(tick, REFRESH_MS);
  }
}
tick();
