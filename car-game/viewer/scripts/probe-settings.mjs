// Settings check: open pause -> settings and screenshot (desk), and the phone HUD buttons.
// Usage: node scripts/probe-settings.mjs [desk|phone]
import { createServer } from 'vite';
import { chromium } from 'playwright';
const phone = process.argv[2] === 'phone';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5194 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(phone ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack?.split('\n').slice(0, 3).join(' | ')));
await page.goto('http://localhost:5194/endless.html?ui=1');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `shots/settings-${phone ? 'phone' : 'desk'}-hud.png` });
await page.evaluate(() => { document.querySelector('#hud .pause').click(); document.querySelector('#hud .paused [data-a=settings]').click(); });
await page.waitForTimeout(400);
await page.screenshot({ path: `shots/settings-${phone ? 'phone' : 'desk'}.png` });
await browser.close(); await server.close();
