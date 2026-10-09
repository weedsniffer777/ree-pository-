// Drive with real key presses through the game loop and print speed over time.
// Usage: node scripts/probe-keys.mjs [map]
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5196 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:5196/endless.html?map=${process.argv[2] || 'yard'}&ui=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
await page.waitForTimeout(1500);
const s = () => page.evaluate(() => { const c = window.__game.car; return `t ${window.__game.race.t.toFixed(2)} vf ${c.vf.toFixed(1)} D ${c.drift.toFixed(2)} cl ${c.clutch?.toFixed(2)} air ${c.airborne} frozen ${window.__game.race?.frozen}`; });
console.log('start', await s());
await page.keyboard.down('KeyS'); await page.waitForTimeout(4000); console.log('after S', await s());
await page.keyboard.up('KeyS');
await page.keyboard.down('KeyW');
for (let k = 0; k < 5; k++) { await page.waitForTimeout(1500); console.log('W', await s()); }
await browser.close(); await server.close();
