// Records the board in use: open-board, watch-board, ack-incident. Usage: node scripts/record.mjs <url> <outdir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url, out = 'recordings'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 1100, height: 620 },
  recordVideo: { dir: out, size: { width: 1100, height: 620 } },
  locale: 'en-GB',
  timezoneId: 'Europe/Warsaw',
});
const page = await ctx.newPage();
const t0 = Date.now();
const mmss = () => { const s = Math.floor((Date.now() - t0) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const events = [];
const note = (flow, what, extra = {}) => { const e = { at: mmss(), ms: Date.now() - t0, wall: new Date().toISOString(), flow, what, ...extra }; events.push(e); console.log(JSON.stringify(e)); };
page.on('console', (m) => { if (m.text().startsWith('ack ')) { const [, id, ackedAt, receipt] = m.text().split(' '); note('ack-incident', 'ack receipt logged', { id, ackedAt, receipt }); } });
await page.goto('about:blank');
await page.waitForTimeout(800);
note('open-board', 'navigate');
await page.goto(url);
if (await page.locator('[data-testid="loader"]').isVisible().catch(() => false)) note('open-board', 'loader visible');
await page.locator('[data-testid="incident-row"]').first().waitFor();
note('open-board', 'incidents on screen', { rows: await page.locator('[data-testid="incident-row"]').count(), loaderGone: await page.locator('[data-testid="loader"]').count() === 0, sha: await page.locator('[data-testid="build-sha"]').textContent() });
const status = page.locator('[data-role="status"]');
note('watch-board', 'status', { text: await status.textContent() });
await page.waitForTimeout(6500);
note('watch-board', 'status after 6.5s, no reload', { text: await status.textContent() });
const row = page.locator('[data-testid="incident-row"]').first();
const id = await row.getAttribute('data-id');
await row.locator('[data-testid="ack"]').hover();
await page.waitForTimeout(1200);
note('ack-incident', 'click Ack', { id });
await row.locator('[data-testid="ack"]').click();
await row.locator('[data-testid="acked"]').waitFor();
note('ack-incident', 'row shows Acked', { id });
await page.waitForTimeout(6000);
note('watch-board', 'after 3 refreshes', { stillAcked: await page.locator(`[data-testid="incident-row"][data-id="${id}"] [data-testid="acked"]`).count() === 1, top: await page.locator('[data-testid="incident-row"]').first().getAttribute('data-id'), text: await status.textContent() });
await page.waitForTimeout(1500);
const video = page.video();
await ctx.close();
const vpath = await video.path();
fs.writeFileSync(`${out}/timeline.json`, JSON.stringify({ url, video: vpath, events }, null, 2));
await browser.close();
console.log('video', vpath);
