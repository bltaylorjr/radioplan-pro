// Records the screen clips for new parts of the introduction video, timed to their narration.
// Usage: node scripts/record-intro-inserts.cjs <narration dir> <out dir> [group ids…]   (app served at http://localhost:4173)
// Writes <out>/<group>.webm and <out>/<group>.json (segment start times in the clip). scripts/splice-intro.py joins them into the video.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), path = require('path');
const [NARR, OUT, ...ONLY] = process.argv.slice(2);
const SAMPLES = process.env.SAMPLES || '/tmp/rec';
const wavSec = (id) => { for (const d of ['out', 'p2', 'p1', 'full']) { const f = path.join(NARR, d, id + '.wav'); if (fs.existsSync(f)) { const b = fs.readFileSync(f); return b.readUInt32LE(40) / b.readUInt32LE(28); } } throw new Error('no wav ' + id); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Each group goes into the old video after `after`. Each segment: page, actions run at its start. */
const GROUPS = [
  { id: 'g1', after: 'models.m6', setup: async (pg) => { await go(pg, 'autodesign'); await pg.selectOption('select[aria-label="Project type"]', 'firealarm').catch(() => {}); await sleep(1500); await dismiss(pg); await go(pg, 'floorplan'); }, segs: [
    { id: 'floorplan.fp1', run: async (pg) => { await sleep(7000); await drop(pg, 'office-A101.pdf', '.drop-zone >> nth=0'); } },
    { id: 'floorplan.fp2', run: async (pg) => { await scrollTo(pg, '.fp-check'); await sleep(9000); await scrollBy(pg, 260, 8000); } },
    { id: 'floorplan.fp3', run: async (pg) => { await scrollTo(pg, '.ask'); await drop(pg, 'phone-photo.jpg', '.ask .drop-zone >> nth=1'); await sleep(1500); await scrollTo(pg, '.fp-check'); await sleep(9000); await scrollTo(pg, '.ask.bad'); await sleep(2500); await drop(pg, 'office-A101.pdf', '.ask.bad .drop-zone'); } },
    { id: 'floorplan.fp4', run: async (pg) => { await sleep(1200); await scrollTo(pg, '.ask.ok'); await sleep(2500); await click(pg, 'button:has-text("Yes, add to the project")'); await sleep(1500); await scrollTo(pg, '.fp-preview'); await sleep(3000); for (const t of ['Room tags', 'Interior walls', 'Room tags', 'Interior walls']) { await pg.locator('.plan-layers label', { hasText: t }).first().click().catch(() => {}); await sleep(1600); } } },
    { id: 'floorplan.fp5', run: async (pg) => { await pg.locator('.fp-preview aside select').nth(1).selectOption('1/4" = 1\'-0"').catch(() => {}); await sleep(4500); await scrollTo(pg, '.page-head'); await click(pg, '.page-head button:has-text("Live view")'); await sleep(1500); await click(pg, '.live-menu button:has-text("Picture in picture")'); await sleep(3000); await go(pg, 'autodesign'); await sleep(2500); await pg.selectOption('select >> nth=1', 'school').catch(() => {}); await sleep(3500); await pg.selectOption('select >> nth=1', 'office').catch(() => {}); } },
  ] },
  { id: 'g2', after: 'tour-rf.t-path', setup: (pg) => go(pg, 'path'), segs: [{ id: 'examples.ex1', run: (pg) => scrollBy(pg, 500, 18000) }, { id: 'examples.ex2', run: (pg) => scrollBy(pg, 500, 18000) }] },
  { id: 'g3', after: 'tour-rf.t-coverage', setup: (pg) => go(pg, 'coverage'), segs: [{ id: 'examples.ex3', run: (pg) => scrollBy(pg, 400, 25000) }, { id: 'examples.ex4', run: (pg) => scrollBy(pg, 300, 10000) }, { id: 'examples.ex5', run: (pg) => scrollBy(pg, 400, 18000) }] },
  { id: 'g4', after: 'tour-lv.t-indoor', setup: (pg) => go(pg, 'indoor'), segs: [{ id: 'examples.ex6', run: (pg) => scrollBy(pg, 700, 28000) }] },
  { id: 'g5', after: 'tour-rf.t-lfhf', setup: (pg) => go(pg, 'lfhf'), segs: [{ id: 'examples.ex7', run: (pg) => scrollBy(pg, 700, 30000) }] },
  { id: 'g6', after: 'tour-tools.t-theory', setup: (pg) => go(pg, 'theory'), segs: [
    { id: 'theory.rf1', run: async (pg) => { await sleep(3000); await pg.locator('input.search').fill('Fresnel').catch(() => {}); await sleep(6000); await pg.locator('input.search').fill('').catch(() => {}); await pg.locator('text=Part 6. RF engineering principles').first().scrollIntoViewIfNeeded().catch(() => {}); await sleep(6000); await scrollBy(pg, 600, 12000); } },
    { id: 'buildout.bo1', run: async (pg) => { await go(pg, 'buildout'); await sleep(4000); await scrollBy(pg, 900, 11000); } },
    { id: 'site.sc1', run: async (pg) => { await go(pg, 'calculators'); await sleep(1500); await scrollTo(pg, '.site-card'); await sleep(8000); await scrollTo(pg, '[data-calc="fa-battery"]'); await sleep(6000); } },
    { id: 'spectrum.sa1', run: async (pg) => { await go(pg, 'spectrum'); await sleep(5000); await pg.locator('summary:has-text("Compatible USB receivers")').click().catch(() => {}); await sleep(1000); await scrollBy(pg, 380, 12000); } },
    { id: 'spectrum.sa2', run: async (pg) => { await pg.locator('summary:has-text("Compatible USB receivers")').click().catch(() => {}); await scrollTo(pg, '.page-head'); await click(pg, '.sa-tests button:has-text("Analyzer self-test")'); await sleep(800); await click(pg, 'button:has-text("Single")'); await sleep(2500); await scrollTo(pg, '.sa-trace'); await sleep(7000); await scrollTo(pg, '.sa-tests'); } },
    { id: 'spectrum.sa3', run: async (pg) => { await scrollTo(pg, '.sa-trace'); await pg.selectOption('.sa-controls select >> nth=0', 'ps800').catch(() => {}); await pg.locator('.sa-controls select').nth(4).selectOption('max').catch(() => {}); await click(pg, 'button:has-text("Run")'); await sleep(6000); await click(pg, 'button:has-text("Peak")'); await sleep(3000); await click(pg, 'button:has-text("Next peak")'); await sleep(5000); await click(pg, 'button:has-text("Stop")'); await scrollBy(pg, 600, 8000); } },
    { id: 'spectrum.sa4', run: async (pg) => { await scrollTo(pg, '.grade-line'); await sleep(5000); await click(pg, 'button:has-text("Save benchmark report")'); await sleep(2000); await scrollBy(pg, 900, 10000); } },
    { id: 'audio.au1', run: async (pg) => { await go(pg, 'audio'); await sleep(2500); await click(pg, 'button:has-text("Start input")'); await sleep(4000); await scrollTo(pg, '.au-big'); await sleep(5000); await pg.locator('button', { hasText: '1/1 octave' }).click().catch(() => {}); await sleep(3000); await pg.locator('button', { hasText: '1/3 octave' }).click().catch(() => {}); } },
    { id: 'audio.au2', run: async (pg) => { await scrollTo(pg, '.sa-tests'); await click(pg, '.sa-tests button:has-text("Room: RT60")'); await sleep(8000); await scrollBy(pg, 300, 8000); } },
    { id: 'audio.au3', run: async (pg) => { await click(pg, '.sa-tests button:has-text("NFPA 72 audibility")'); await sleep(8000); await click(pg, '.sa-tests button:has-text("Benchmark the measuring chain")'); await sleep(6000); await scrollBy(pg, 400, 6000); } },
  ] },
];

async function dismiss(pg) { for (const t of ['OK']) { const x = pg.locator('button', { hasText: t }).first(); if (await x.count() && await x.isVisible().catch(() => false)) await x.click().catch(() => {}); } }
async function go(pg, id) { await pg.evaluate((h) => { location.hash = h; }, id); await sleep(900); await pg.evaluate(() => window.scrollTo(0, 0)); }
async function click(pg, sel) { await pg.locator(sel).first().click({ timeout: 4000 }).catch((e) => console.warn('click', sel, e.message.split('\n')[0])); }
async function scrollTo(pg, sel) { await pg.evaluate((s) => { const e = document.querySelector(s); if (e) window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' }); }, sel).catch(() => {}); await sleep(900); }
async function scrollBy(pg, px, ms) { const n = Math.max(1, Math.round(ms / 50)); for (let i = 0; i < n; i++) { await pg.evaluate((d) => window.scrollBy(0, d), px / n); await sleep(50); } }
async function drop(pg, file, sel) {
  const buf = fs.readFileSync(path.join(SAMPLES, file)).toString('base64');
  const dt = await pg.evaluateHandle(({ buf, name }) => { const b = Uint8Array.from(atob(buf), (c) => c.charCodeAt(0)); const d = new DataTransfer(); d.items.add(new File([b], name, { type: name.endsWith('pdf') ? 'application/pdf' : 'image/jpeg' })); return d; }, { buf, name: file });
  await pg.dispatchEvent(sel, 'dragenter', { dataTransfer: dt }).catch(() => {}); await sleep(500); await pg.dispatchEvent(sel, 'drop', { dataTransfer: dt }).catch((e) => console.warn('drop', e.message));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  for (const g of GROUPS.filter((x) => !ONLY.length || ONLY.includes(x.id))) {
    const t0 = Date.now();
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, permissions: ['microphone'], recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
    await ctx.addInitScript(() => { localStorage.setItem('radioplan.seenIntro', '1'); localStorage.setItem('radioplan.seenVideo', '1'); try { delete window.documentPictureInPicture; } catch { /* */ } addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.chip.terr{display:none!important}'; document.head.appendChild(st); }); });
    const pg = await ctx.newPage(); pg.on('pageerror', (e) => console.warn('pageerror', String(e)));
    await pg.goto('http://localhost:4173/#company'); await sleep(3000);
    for (const t of ['OK', 'Skip']) { const x = pg.locator('button', { hasText: t }).first(); if (await x.count() && await x.isVisible().catch(() => false)) await x.click().catch(() => {}); }
    await g.setup(pg); await sleep(1500); await dismiss(pg);
    const start = (Date.now() - t0) / 1000, marks = [];
    for (const s of g.segs) {
      const at = (Date.now() - t0) / 1000, dur = wavSec(s.id), end = Date.now() + (dur + 0.7) * 1000;
      marks.push({ id: s.id, at: at - start, dur });
      await Promise.race([s.run(pg).catch((e) => console.warn(s.id, e.message)), sleep((dur + 0.6) * 1000)]);
      while (Date.now() < end) await sleep(40);
    }
    await sleep(600); const vid = await pg.video().path(); await ctx.close();
    fs.renameSync(vid, path.join(OUT, g.id + '.webm'));
    fs.writeFileSync(path.join(OUT, g.id + '.json'), JSON.stringify({ after: g.after, start, marks }, null, 1));
    console.log(g.id, 'done', marks.length, 'segments');
  }
  await b.close();
})();
