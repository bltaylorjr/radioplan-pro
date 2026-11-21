// 1.5.83 capture run. Records the Magnetic Field & Space Weather and Weather & Radar (NOAA) scenes of the intro video (1280x720).
// CAPTURE=1: lets every outside request through and saves the responses to OUT/noaa-capture.json (run where NOAA is reachable).
// Otherwise: replays OUT/noaa-capture.json (or CAP=<file>), with map tiles from ./t/tiles as a fallback.
// Run: OUT=<working folder> node rec-noaa.cjs   (app at http://localhost:4173). Writes raw/*.webm and timing.json in OUT.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const D = process.env.OUT || __dirname, CAPTURE = !!process.env.CAPTURE;
const CAPF = process.env.CAP || path.join(D, 'noaa-capture.json');
const T = path.join(__dirname, 't/tiles');
const APP = process.env.APP || 'http://localhost:4173/';
const key = (u) => u.replace(/([?&])(_t|t)=\d+&?/g, '$1').replace(/[?&]$/, '');
function tileFile(url) {
  let m;
  if ((m = url.match(/USGSImageryOnly\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/))) return `${T}/usgsimg/${m[1]}/${m[3]}/${m[2]}`;
  if ((m = url.match(/USGSImageryTopo\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/))) return `${T}/usgsimgtopo/${m[1]}/${m[3]}/${m[2]}`;
  if ((m = url.match(/USGSTopo\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/))) return `${T}/usgstopo/${m[1]}/${m[3]}/${m[2]}`;
  if ((m = url.match(/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/))) return `${T}/terrarium/${m[1]}/${m[2]}/${m[3]}`;
  return null;
}
const CSS = `
  #cap { position: fixed; left: 40px; bottom: 26px; right: 120px; z-index: 99999; pointer-events: none; color: #fff; font-family: Inter, system-ui, sans-serif;
    text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 6px #000; }
  #cap .k { font-size: 15px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  #cap .t { font-size: 27px; font-weight: 800; line-height: 1.15; }
  #cap .s { font-size: 19px; font-weight: 600; line-height: 1.25; margin-top: 2px; }
  .chip.terr, .tool-notice { display: none !important; }
  .rec-ring { outline: 4px solid #ff9800 !important; outline-offset: 2px; border-radius: 6px; transition: outline .2s; }`;

(async () => {
  const saved = CAPTURE ? { __at: Date.now() } : JSON.parse(fs.readFileSync(CAPF, 'utf8'));
  // Replay: run the page clock as if it were the moment of the capture, so time-stamped NOAA requests (radar loop frames) match.
  const shift = CAPTURE || !saved.__at ? 0 : saved.__at - Date.now() + 60e3;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: path.join(D, 'raw'), size: { width: 1280, height: 720 } },
    geolocation: { latitude: 35.5951, longitude: -82.5515 }, permissions: ['geolocation'] });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('ERR', e.message));
  await ctx.route(/^https?:\/\/(?!localhost)/, async (r) => {
    const u = r.request().url();
    if (CAPTURE) {
      try {
        const res = await r.fetch(); const body = await res.body();
        saved[key(u)] = { s: res.status(), ct: res.headers()['content-type'] || '', b: body.toString('base64') };
        return r.fulfill({ response: res, body });
      } catch (e) { console.log('fetch fail', u, e.message.slice(0, 80)); return r.fulfill({ status: 404, body: '' }); }
    }
    const hit = typeof saved[key(u)] === 'object' ? saved[key(u)] : null;
    if (hit) return r.fulfill({ status: hit.s, contentType: hit.ct, headers: { 'access-control-allow-origin': '*' }, body: Buffer.from(hit.b, 'base64') });
    const f = tileFile(u);
    if (f && fs.existsSync(f)) return r.fulfill({ status: 200, contentType: f.includes('terrarium') ? 'image/png' : 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    console.log('miss', u.slice(0, 140));
    return r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  if (shift) await pg.addInitScript((sh) => {
    const D0 = Date; const N = () => D0.now() + sh;
    class D extends D0 { constructor(...a) { super(...(a.length ? a : [N()])); } static now() { return N(); } }
    window.Date = D;
  }, shift);
  await pg.addInitScript((css) => {
    localStorage.setItem('radioplan.seenVideo', '1'); localStorage.setItem('radioplan.seenIntro', '1');
    localStorage.setItem('radioplan.basemap', 'USGS Topo');
    document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); });
  }, CSS);
  const t0 = Date.now(); const marks = {}, ends = {};
  const start = (id) => { marks[id] = Date.now(); console.log('scene', id); }, until = (id) => { ends[id] = Date.now(); };
  const wait = (ms) => pg.waitForTimeout(ms);
  const K = 'Tools & reference';
  const cap = (t, s = '') => pg.evaluate(([k, t, s]) => {
    let c = document.getElementById('cap'); if (!c) { c = document.createElement('div'); c.id = 'cap'; document.body.appendChild(c); }
    c.innerHTML = `<div class="k">${k}</div><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ''}`;
  }, [K, t, s]);
  const nocap = () => pg.evaluate(() => document.getElementById('cap')?.remove());
  const go = async (id, ms = 2500) => {
    await pg.evaluate((id) => { location.hash = id; }, id).catch(() => {}); await wait(ms);
    await pg.click('button:has-text("Turn it back on")', { timeout: 300 }).then(() => wait(400)).catch(() => {});
    await pg.evaluate(() => window.scrollTo(0, 0));
  };
  const L = (sel) => (typeof sel === 'string' ? pg.locator(sel) : sel).first();
  const ring = async (sel, ms = 1200) => {
    const el = L(sel); if (!(await el.count())) { console.log('missing', sel); return; }
    await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(450);
    await el.evaluate((e) => e.classList.add('rec-ring')); await wait(ms);
    await el.evaluate((e) => e.classList.remove('rec-ring')).catch(() => {});
  };
  const show = async (sel, y = 90, ms = 900) => {
    const el = L(sel); if (!(await el.count())) { console.log('missing', sel); return; }
    await el.evaluate((e, y) => window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - y, behavior: 'smooth' }), y); await wait(ms);
  };
  const tour = (t) => `[data-tour="${t}"]`;
  const scrollBy = async (y, ms = 1200) => { await pg.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), y); await wait(ms); };

  await pg.goto(APP + '#company'); await wait(3000);

  // Magnetic Field & Space Weather
  start('mg1'); await cap('Magnetic Field & Space Weather', 'Compass declination at the job, from NOAA’s World Magnetic Model');
  await go('magnetic', 3500); await ring(tour('mag-today'), 3500);
  until('mg1');

  start('mg2'); await cap('How it changes over time', 'Every half year to 2030, with a chart');
  await show(tour('mag-predict'), 80, 1500); await ring(tour('mag-predict'), 3000);
  until('mg2');

  start('mg3'); await cap('Map bearing ↔ compass reading', 'Type either one and the app works out the other');
  await show(tour('mag-convert'), 120, 1200);
  const tb = pg.locator(`${tour('mag-convert')} input`).first();
  if (await tb.count()) { await tb.click(); await tb.fill(''); await tb.type('52', { delay: 220 }); await pg.keyboard.press('Tab'); }
  await wait(800); await ring(tour('mag-convert'), 3000);
  until('mg3');

  start('mg4'); await cap('Space weather, live from NOAA', 'Storm levels and radio blackouts for compass, GPS and HF radio. Each download is checked.');
  await show(tour('mag-space'), 80, 1500); await wait(1500); await scrollBy(250, 2000);
  await ring(pg.locator(`${tour('mag-space')} :text-matches("Verified|Checked")`), 2200);
  until('mg4');

  start('mg6'); await cap('Space weather maps', 'Aurora forecast and HF radio blackout map, kept for offline use');
  await show(tour('mag-maps'), 80, 1800); await wait(1200);
  await pg.locator(`${tour('mag-maps')} [role=tab]`).nth(1).click().catch(() => {}); await wait(2200);
  await pg.locator(`${tour('mag-maps')} [role=tab]`).nth(0).click().catch(() => {}); await wait(1500);
  until('mg6');

  start('mg7'); await cap('Declination map', 'Lines of equal compass declination across the US. Works with no internet.');
  await show(tour('mag-declmap'), 80, 1800); await ring(tour('mag-declmap'), 2800);
  until('mg7');

  start('mg5'); await cap('Saved with this project', 'Used on drawings and reports. Kept for offline use.');
  await show(tour('mag-project'), 120, 1200); await ring(tour('mag-project'), 3000);
  until('mg5');

  // Weather & Radar (NOAA)
  start('wx1'); await cap('Weather & Radar (NOAA)', 'Live conditions from the nearest National Weather Service station');
  await go('weather', 5000); await ring(tour('wx-now'), 2500);
  await ring(pg.locator(`${tour('wx-now')} :text-matches("Verified|Checked")`), 1800);
  until('wx1');

  start('wx2'); await cap('Radar map', 'NOAA’s live radar with alert areas outlined. ▶ Play last hour shows where storms are heading.');
  await show(tour('wx-radar'), 80, 2500); await wait(1500);
  await pg.click('[data-tour="wx-loop"] button', { timeout: 2000 }).catch(() => console.log('no loop button')); await wait(9000);
  until('wx2');

  start('wx6'); await cap('NOAA maps', 'Satellite, lightning, storm outlooks and forecast maps, each with its time');
  await show(tour('wx-maps'), 80, 1500); await wait(1500);
  const tabs = pg.locator(`${tour('wx-maps')} [role=tab]`);
  await tabs.nth(2).click().catch(() => {}); await wait(1800);
  const grp = pg.locator(`${tour('wx-maps')} .row button`);
  await grp.nth(1).click().catch(() => {}); await wait(2200);
  await grp.nth(2).click().catch(() => {}); await wait(2200);
  await grp.nth(0).click().catch(() => {}); await wait(1000);
  until('wx6');

  start('wx3'); await cap('Work-day check', 'Lightning, wind, cold, heat and rain for the next 24 hours');
  await show(tour('wx-work'), 80, 1200); await ring(tour('wx-work'), 2500);
  await show(tour('wx-hourly'), 80, 1200); await wait(1800);
  until('wx3');

  start('wx4'); await cap('7-day forecast', 'Day and night. Tap a day for the full forecast.');
  await show(tour('wx-week'), 80, 1500);
  const day = pg.locator(`${tour('wx-week')} details, ${tour('wx-week')} button, ${tour('wx-week')} li`).first();
  if (await day.count()) { await day.click().catch(() => {}); }
  await wait(2500);
  until('wx4');

  start('wx5'); await cap('Weather on this project', 'Other pages warn you. One tap adds it to Field Notes.');
  await show(tour('wx-project'), 120, 1200); await ring(tour('wx-project'), 3000);
  until('wx5');

  await nocap(); await wait(600);
  const vid = pg.video(); await ctx.close(); await b.close();
  if (CAPTURE) { fs.writeFileSync(CAPF, JSON.stringify(saved)); console.log('captured', Object.keys(saved).length); }
  const raw = await vid.path();
  const sc = {}; for (const k of Object.keys(marks)) sc[k] = [(marks[k] - t0) / 1000, ((ends[k] || Date.now()) - t0) / 1000];
  fs.writeFileSync(path.join(D, 'timing.json'), JSON.stringify({ raw, off: 0, scenes: sc }, null, 1));
  console.log('done', raw);
})();
