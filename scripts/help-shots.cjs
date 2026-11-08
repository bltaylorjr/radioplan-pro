// Makes the page screenshots used in Help (src/help/shots/<page>.jpg).
// Run after `npx vite build && npx vite preview --port 4173`: node scripts/help-shots.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const labels = fs.readFileSync(path.join(__dirname, '../src/data/pageLabels.ts'), 'utf8');
const pages = [...labels.matchAll(/^  ([a-z0-9]+):/gm)].map((m) => m[1]);
const out = path.join(__dirname, '../src/help/shots');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1100, height: 720 } });
  await pg.goto('http://localhost:4173/'); await pg.waitForTimeout(1500);
  const sk = pg.locator('.welcome-back button', { hasText: 'Skip' }); if (await sk.count()) await sk.click();
  await pg.evaluate(() => { location.hash = 'autodesign'; }); await pg.waitForTimeout(800);
  await pg.selectOption('select[aria-label="Project type"]', 'firealarm'); await pg.waitForTimeout(300);
  await pg.addStyleTag({ content: '.sidebar,.topbar,.update-bar{display:none!important} .app{display:block!important} .content{padding:12px!important}' });
  for (const id of pages) {
    await pg.evaluate((h) => { location.hash = h; }, id); await pg.waitForTimeout(id === 'terrain' || id === 'coverage' || id === 'view3d' ? 2500 : 900);
    await pg.screenshot({ path: path.join(out, `${id}.jpg`), type: 'jpeg', quality: 55 });
  }
  await b.close();
  console.log(`${pages.length} screenshots in ${out}`);
})();
