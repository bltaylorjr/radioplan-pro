// Shared helpers: Chrome with offline tile serving from /tmp/tiles and a log of missing tiles.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TILES = process.env.TILES || '/tmp/tiles';
const MISS = path.join(TILES, 'missing.txt');
// NOAA capture (video-capture.yml): keyed by URL without the _t / t cache-busting parameter; __at is when it was made.
const key = (u) => u.replace(/([?&])(_t|t)=\d+&?/g, '$1').replace(/[?&]$/, '');
let CAPTURE = {}; try { CAPTURE = JSON.parse(fs.readFileSync(process.env.NOAA_CAPTURE || '/tmp/noaa/noaa-capture.json', 'utf8')); } catch { /* no saved NOAA data */ }
const HOSTS = /(basemap\.nationalmap\.gov|elevation-tiles-prod|tile\.openstreetmap\.org|tile\.opentopomap\.org|server\.arcgisonline\.com)/;
async function newPage(b, recordDir) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, permissions: ['microphone'], ...(recordDir ? { recordVideo: { dir: recordDir, size: { width: 1280, height: 720 } } } : {}) });
  await ctx.addInitScript(() => { localStorage.setItem('radioplan.seenIntro', '1'); localStorage.setItem('radioplan.seenVideo', '1'); localStorage.setItem('radioplan.autoHideTools', '0'); try { delete window.documentPictureInPicture; } catch { /* */ } addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.chip.terr{display:none!important}'; document.head.appendChild(st); }); });
  await ctx.route((u) => !u.href.startsWith('http://localhost'), async (route) => {
    const href = route.request().url(); const u = new URL(href);
    const f = path.join(TILES, u.hostname.replace(/^[abc]\./, ''), u.pathname);
    let tile = null; if (HOSTS.test(href)) { try { tile = fs.readFileSync(f); } catch { /* not saved */ } }
    if (tile) return route.fulfill({ status: 200, body: tile, headers: { 'access-control-allow-origin': '*', 'content-type': f.endsWith('.png') ? 'image/png' : 'image/jpeg' } });
    const c = CAPTURE[href] || CAPTURE[key(href)];
    if (c) return route.fulfill({ status: c.s, body: Buffer.from(c.b, 'base64'), headers: { 'access-control-allow-origin': '*', 'content-type': c.ct } });
    fs.appendFileSync(MISS, href + '\n'); return route.fulfill({ status: 404, body: '', headers: { 'access-control-allow-origin': '*' } });
  });
  // Run the page clock at the capture time, so NOAA forecasts and radar frames line up with the saved data.
  const shift = CAPTURE.__at ? CAPTURE.__at - Date.now() + 60e3 : 0;
  if (shift) await ctx.addInitScript((sh) => { const D0 = Date; class D extends D0 { constructor(...a) { super(...(a.length ? a : [D0.now() + sh])); } static now() { return D0.now() + sh; } } window.Date = D; }, shift);
  const pg = await ctx.newPage(); pg.on('pageerror', (e) => console.warn('pageerror', String(e)));
  await pg.goto('http://localhost:4173/#company'); await sleep(3000);
  for (const t of ['OK', 'Skip']) { const x = pg.locator('button', { hasText: t }).first(); if (await x.count() && await x.isVisible().catch(() => false)) await x.click().catch(() => {}); }
  return { ctx, pg };
}
const launch = () => chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
async function go(pg, id) { await pg.evaluate((h) => { location.hash = h; }, id); await sleep(900); await pg.evaluate(() => window.scrollTo(0, 0)); }
async function click(pg, sel) { await pg.locator(sel).first().click({ timeout: 4000 }).catch((e) => console.warn('click', sel, e.message.split('\n')[0])); }
async function scrollTo(pg, sel) { await pg.evaluate((s) => { const e = document.querySelector(s); if (e) window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' }); }, sel).catch(() => {}); await sleep(900); }
async function scrollBy(pg, px, ms) { const n = Math.max(1, Math.round(ms / 50)); for (let i = 0; i < n; i++) { await pg.evaluate((d) => window.scrollBy(0, d), px / n); await sleep(50); } }
module.exports = { launch, newPage, go, click, scrollTo, scrollBy, sleep };
