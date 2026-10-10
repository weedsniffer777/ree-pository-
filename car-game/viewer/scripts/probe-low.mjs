// Preset check: load with ?q=<preset>, print camera/car state and errors, screenshot.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5189 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 300)); });
await page.goto(`http://localhost:5189/endless.html?ui=0&q=${process.argv[2] || 'low'}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
await page.waitForTimeout(3000);
if (process.argv[3]) await page.evaluate((r) => window.__game.setRes(Number(r)), process.argv[3]);
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => { const c = window.__game.car; return { x: c.x, y: c.y, z: c.z, pr: devicePixelRatio }; }));
await page.screenshot({ path: 'shots/probe-low.png' });
await browser.close(); await server.close();
