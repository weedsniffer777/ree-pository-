// Track screenshots. Usage: node scripts/shot-track.mjs <outdir> "name|query" ...
// e.g. node scripts/shot-track.mjs shots "yard_a|map=yard&at=300&view=chase"
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
  const [name, q = ''] = s.split('|');
  await page.goto(`http://localhost:5197/endless.html?ui=0&${q}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify(await page.evaluate(() => ({ ...window.__stats, dbg: window.__dbg }))));
}
if (errors.length) console.error('PAGE ERRORS:\n' + [...new Set(errors)].slice(0, 6).join('\n'));
await browser.close();
await server.close();
