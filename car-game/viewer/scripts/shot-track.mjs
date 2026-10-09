// Track screenshots. Usage: node scripts/shot-track.mjs <outdir> "name|query" ...
// e.g. node scripts/shot-track.mjs shots "yard_a|map=yard&at=300&view=chase" "phone|map=yard&ui=1|844x390"
// UI is hidden unless the query sets ui=
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const [out, ...shots] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ root, logLevel: 'error', server: { port: 5197 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack?.split('\n').slice(0, 3).join(' ') ?? e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
for (const s of shots) {
  const [name, q = '', size = '', wait = '300'] = s.split('|'); // size "WxH" = phone (touch) viewport; wait ms before the shot
  let pg = page;
  if (size) {
    const [width, height] = size.split('x').map(Number);
    pg = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    pg.on('pageerror', (e) => errors.push(e.stack?.split('\n').slice(0, 3).join(' ') ?? e.message));
  }
  await pg.goto(`http://localhost:5197/endless.html?${/(^|&)ui=/.test(q) ? '' : 'ui=0&'}${q}`);
  try { await pg.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }); } catch (e) { console.error(name, 'never ready', errors.slice(-3)); continue; }
  await pg.waitForTimeout(Number(wait));
  await pg.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify(await pg.evaluate(() => ({ ...window.__stats, dbg: window.__dbg }))));
  if (pg !== page) await pg.close();
}
if (errors.length) console.error('PAGE ERRORS:\n' + [...new Set(errors)].slice(0, 6).join('\n'));
await browser.close();
await server.close();
