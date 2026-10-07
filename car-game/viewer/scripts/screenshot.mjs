// Renders viewer screenshots headlessly.
// Usage: npm run shot -- [model] [view,view,...] [extra query]
// e.g.   npm run shot -- starter_coupe chase,side,front34 "sockets=1"
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const [model = 'starter_coupe', views = 'chase,side,front34', extra = ''] = process.argv.slice(2);

const server = await createServer({ root, logLevel: 'error', server: { port: 5199 } });
await server.listen();
const base = `http://localhost:${server.config.server.port}`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

mkdirSync(`${root}/shots`, { recursive: true });
for (const view of views.split(',')) {
  await page.goto(`${base}/?model=${model}&view=${view}&ui=0&${extra}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const file = `${root}/shots/${model}_${view}.png`;
  await page.screenshot({ path: file });
  console.log(file, '|', await page.textContent('#stats'));
}
if (errors.length) console.error('PAGE ERRORS:\n' + errors.join('\n'));

await browser.close();
await server.close();
