import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = board.querySelector('[data-testid="incident-list"]');
const loader = board.querySelector('[data-testid="loader"]');
const empty = board.querySelector('[data-testid="empty"]');
const status = document.querySelector('[data-role="status"]');

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

// R1: keep rows keyed by id, so a refresh never redraws a row someone is about to click.
// New incidents go in at the top, newest first; rows that left the feed are removed.
function render(incidents, initial) {
  const want = new Set(incidents.map((i) => i.id));
  for (const li of [...list.children]) if (!want.has(li.dataset.id)) li.remove();

  let prev = null;
  for (const i of incidents) {
    let li = list.querySelector(`[data-testid="incident-row"][data-id="${CSS.escape(i.id)}"]`);
    if (!li) {
      const tpl = document.createElement('template');
      tpl.innerHTML = rowHtml(i).trim();
      li = tpl.content.firstChild;
      if (!initial) li.classList.add('new');
    }
    const at = prev ? prev.nextSibling : list.firstChild;
    if (li !== at) list.insertBefore(li, at);
    prev = li;
  }

  loader.remove(); // R3: gone once incidents load
  list.hidden = incidents.length === 0;
  empty.hidden = incidents.length !== 0;
}

// R2: Ack acks the incident of the row clicked (by its id), then marks that row acked.
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
    render(page.incidents, first);
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
