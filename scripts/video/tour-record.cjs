// Records the 1.5.78 tour: one continuous screen recording, each section timed to its narration.
// Usage: node tour-record.cjs <narration dir> <out dir> [first id] [last id]
const L = require('./rec-lib.cjs'); const { go, click, scrollTo, sleep } = L;
const fs = require('fs'), path = require('path');
const [NARR, OUT, FROM, TO] = process.argv.slice(2);
const SCRIPT = JSON.parse(fs.readFileSync('/home/claude/radioplan-pro/scripts/tour-script.json', 'utf8'));
const wavSec = (id) => { const b = fs.readFileSync(path.join(NARR, id + '.wav')); return b.readUInt32LE(40) / b.readUInt32LE(28); };
const GAP = 0.9;

async function smoothScroll(pg, ms, maxPx = 1800) {
  const total = await pg.evaluate((m) => Math.max(0, Math.min(m, document.documentElement.scrollHeight - innerHeight - window.scrollY)), maxPx);
  const n = Math.max(1, Math.round(ms / 50));
  for (let i = 0; i < n; i++) { await pg.evaluate((d) => window.scrollBy(0, d), total / n); await sleep(50); }
}
async function tap(pg, sel) { const b = await pg.locator(sel).filter({ visible: true }).first().boundingBox({ timeout: 2500 }).catch(() => null); if (b) await pg.mouse.click(b.x + b.width / 2, b.y + b.height / 2); else console.warn('tap: none', sel); }
async function markerXY(pg, t) { return pg.evaluate((t) => { const m = [...document.querySelectorAll('.leaflet-marker-icon')].find((e) => (e.textContent || '').trim() === t); if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 6 }; }, t); }

/** Page actions for sections that show more than a scroll. Each gets the section length in ms. */
const ACT = {
  'use.menu': async (pg, ms) => {
    await sleep(2500); await pg.locator('.nav-group-title').nth(1).click().catch(() => {}); await sleep(1800); await pg.locator('.nav-group-title').nth(1).click().catch(() => {});
    await sleep(1500); const f = pg.locator('.sidebar input').first(); await f.click().catch(() => {}); await f.type('azimuth', { delay: 120 }).catch(() => {}); await sleep(3500); await f.fill('').catch(() => {}); await pg.mouse.click(700, 400);
    await sleep(Math.max(0, ms - 19500)); await tap(pg, 'button.nav-showall'); await sleep(2200); await click(pg, '.tool-notice button:has-text("OK")');
  },
  'use.help': async (pg, ms) => {
    await sleep(1500); await click(pg, 'button:has-text("Guide me")'); await sleep(3500); await pg.keyboard.press('Escape'); await click(pg, 'button:has-text("Skip"), button:has-text("Close"), button:has-text("End")'); await sleep(800);
    const i = pg.locator('.info-i, button.info, [aria-label*="What this"]').first(); await i.hover().catch(() => {}); await i.click().catch(() => {}); await sleep(4000); await pg.mouse.click(900, 150);
    await click(pg, 'button:has-text("Clear all fields")'); await sleep(3800); await click(pg, 'button:has-text("No"), button:has-text("Cancel"), button:has-text("Keep")'); await sleep(1000);
  },
  't.systems': async (pg) => { await sleep(3000); await pg.selectOption('select[aria-label="Project type"]', 'firealarm').catch((e) => console.warn('type', e.message.split('\n')[0])); await sleep(2500); await pg.getByRole('checkbox', { name: /Emergency Responder Radio/ }).first().check({ timeout: 2000 }).catch((e) => console.warn('erces', e.message.split('\n')[0])); await sleep(1500); await smoothScroll(pg, 9000, 900); },
  't.locate': async (pg) => { await sleep(1500); const f = pg.locator('input').filter({ visible: true }).nth(1); await f.click().catch(() => {}); await f.type('35.5951, -82.5515', { delay: 90 }).catch(() => {}); await sleep(600); await click(pg, 'button:has-text("Search")'); await sleep(5000); await smoothScroll(pg, 3000, 500); await click(pg, 'button:has-text("Build plan for this location")'); await sleep(4000); await smoothScroll(pg, 6000, 900); },
  't.terrain': async (pg) => {
    await scrollTo(pg, '.leaflet-container'); await sleep(2200);
    for (let k = 0; k < 3; k++) { const a = await markerXY(pg, 'A'); if (a) await pg.mouse.dblclick(a.x + 70, a.y - 45); await sleep(1500); }
    await sleep(1500); await click(pg, 'button:has-text("3D tilt view")'); await sleep(7000); await click(pg, 'button:has-text("Flat map")'); await sleep(1500); await click(pg, 'button:has-text("Measure distance")'); await sleep(4000);
  },
  't.coverage': async (pg) => { await sleep(2500); await click(pg, 'button:has-text("Run coverage prediction")'); await sleep(6000); await scrollTo(pg, '.leaflet-container'); await pg.evaluate(() => window.scrollBy(0, -150)); await sleep(5000); await smoothScroll(pg, 8000, 900); },
  't.path': async (pg) => { await sleep(2500); await click(pg, 'button:has-text("Compute path profile")'); await sleep(4000); await smoothScroll(pg, 14000, 1400); },
  't.optimize': async (pg) => { await sleep(2500); await smoothScroll(pg, 9000, 900); await click(pg, 'button:has-text("3D view")'); await sleep(6000); },
  't.view3d': async (pg) => { await sleep(3000); await scrollTo(pg, 'canvas'); await sleep(2000); const c = await pg.locator('canvas').first().boundingBox().catch(() => null); if (c) { await pg.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await pg.mouse.down(); for (let i = 0; i < 40; i++) { await pg.mouse.move(c.x + c.width / 2 + i * 6, c.y + c.height / 2); await sleep(60); } await pg.mouse.up(); } await sleep(4000); },
  't.autodesign': async (pg) => { await sleep(2500); await pg.selectOption('select >> nth=1', 'office').catch(() => {}); await sleep(3000); await smoothScroll(pg, 14000, 1800); },
  't.models': async (pg) => { await sleep(2500); await smoothScroll(pg, 16000, 2000); },
  't.spectrum': async (pg) => { await sleep(2500); await click(pg, 'button:has-text("Use test signals")'); await sleep(1000); await scrollTo(pg, '.sa-trace'); await click(pg, 'button:has-text("Run")'); await sleep(9000); await click(pg, 'button:has-text("Stop")'); await smoothScroll(pg, 6000, 900); },
  't.audio': async (pg) => { await sleep(2000); await click(pg, 'button:has-text("Start input")'); await sleep(3000); await scrollTo(pg, '.au-big'); await sleep(8000); await smoothScroll(pg, 6000, 900); },
  't.reports': async (pg) => { await sleep(2500); await smoothScroll(pg, 9000, 900); await scrollTo(pg, '.project-complete'); await sleep(5000); },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let segs = SCRIPT; const a = FROM ? segs.findIndex((x) => x.id === FROM) : 0; const z = TO ? segs.findIndex((x) => x.id === TO) : segs.length - 1; segs = segs.slice(a, z + 1);
  const b = await L.launch(); const t0 = Date.now(); const { ctx, pg } = await L.newPage(b, OUT);
  if (segs[0].id === 'use.menu') { await pg.evaluate(() => localStorage.setItem('radioplan.hiddenTools', JSON.stringify(['lfhf', 'audio', 'spectrum']))); await pg.reload(); await sleep(2500); }
  await go(pg, segs[0].page); await sleep(2000);
  const start = (Date.now() - t0) / 1000, marks = [];
  for (const s of segs) {
    const dur = wavSec(s.id), slot = (dur + GAP) * 1000, end = Date.now() + slot;
    const at = (Date.now() - t0) / 1000; marks.push({ id: s.id, at: at - start, dur });
    const run = async () => { await go(pg, s.page); await sleep(500); await (ACT[s.id] ? ACT[s.id](pg, slot) : (async () => { await sleep(2200); await smoothScroll(pg, Math.max(2000, slot - 5000)); })()); };
    await Promise.race([run().catch((e) => console.warn(s.id, e.message.split('\n')[0])), sleep(slot - 150)]);
    while (Date.now() < end) await sleep(30);
    await pg.screenshot({ path: path.join(OUT, `${s.id}.png`) }).catch(() => {});
    console.log('done', s.id, dur.toFixed(1));
  }
  await sleep(800); const vid = await pg.video().path(); await ctx.close(); await b.close();
  const name = `tour-${segs[0].id}`;
  fs.renameSync(vid, path.join(OUT, name + '.webm'));
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ start, marks }, null, 1));
  console.log('recorded', name, marks.length);
})();
