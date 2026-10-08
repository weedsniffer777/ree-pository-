// Renders Level 1 screenshots headlessly.
// Usage: npm run shot:level -- "name|query" ["name|query" ...]
// e.g.   npm run shot:level -- "start|view=chase" "gas|at=480&view=aerial"
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shots = process.argv.slice(2);
const server = await createServer({ root, logLevel: 'error', server: { port: 5198 } });
await server.listen();
const base = `http://localhost:${server.config.server.port}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
mkdirSync(`${root}/shots`, { recursive: true });
for (const s of shots) {
  const [name, q = ''] = s.split('|');
  await page.goto(`${base}/${process.env.PAGE || 'level'}.html?${q}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(200);
  const file = `${root}/shots/level_${name}.png`;
  await page.screenshot({ path: file });
  console.log(file, JSON.stringify(await page.evaluate(() => window.__stats)));
}
if (errors.length) console.error('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
await server.close();
