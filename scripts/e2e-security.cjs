// Security check in a real browser: the built app (npm run build, then `npx vite preview --port 4173`) must
// carry its Content Security Policy, open every page in the menu without a single policy violation or page
// error, and refuse an injected inline script. Usage: node scripts/e2e-security.cjs [http://localhost:4173]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const BASE = process.argv[2] || 'http://localhost:4173';

(async () => {
  const fs = require('fs');
  const menu = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'menu.ts'), 'utf8');
  const pages = [...menu.matchAll(/\{ id: '([\w-]+)', label: '[^']+', group: '/g)].map((m) => m[1]);
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await b.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    localStorage.setItem('radioplan.seenIntro', '1'); localStorage.setItem('radioplan.seenVideo', '1');
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  // no network beyond the app itself: outside requests get an empty answer (this test is about the page, not the data)
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.fulfill({ status: 204, body: '' }));
  const pg = await ctx.newPage(); const errors = [];
  pg.on('pageerror', (e) => errors.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errors.push(m.text()); });
  await pg.goto(BASE + '/#company'); await pg.waitForTimeout(2500);
  const fail = [];
  const csp = await pg.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '');
  if (!/script-src 'self'/.test(csp) || /script-src[^;]*'unsafe-(inline|eval)'/.test(csp)) fail.push('Content Security Policy missing or allows inline scripts / eval: ' + csp);
  if (!/object-src 'none'/.test(csp) || !/base-uri 'self'/.test(csp)) fail.push('Content Security Policy must block plugins and base-tag changes');
  for (const id of pages) {
    await pg.evaluate((h) => { location.hash = h; }, id); await pg.waitForTimeout(700);
    const v = await pg.evaluate(() => window.__csp.splice(0));
    for (const x of v) fail.push(`${id}: policy violation ${x}`);
  }
  // an injected inline script must not run
  const ran = await pg.evaluate(() => new Promise((res) => { window.__ran = false; const s = document.createElement('script'); s.textContent = 'window.__ran = true'; document.body.appendChild(s); setTimeout(() => res(window.__ran), 300); }));
  if (ran) fail.push('an injected inline script ran');
  for (const e of errors) if (!/Executing inline script violates|__ran/.test(e)) fail.push('page error: ' + e);
  await b.close();
  if (fail.length) { console.error('Security check failed:\n- ' + fail.join('\n- ')); process.exit(1); }
  console.log(`Security check passed: ${pages.length} pages, no policy violations, injected script blocked.`);
})().catch((e) => { console.error(e); process.exit(1); });
