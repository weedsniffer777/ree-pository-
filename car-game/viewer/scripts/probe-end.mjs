// End-sequence check: force an ending and screenshot its beats into shots/.
// Usage: node scripts/probe-end.mjs kill|death|finish [desk|phone]
import { createServer } from 'vite';
import { chromium } from 'playwright';
const mode = process.argv[2] || 'kill', phone = process.argv[3] === 'phone';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5198 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(phone ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack?.split('\n').slice(0, 4).join(' | ')));
await page.goto('http://localhost:5198/endless.html?map=yard&ui=1');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
await page.waitForTimeout(2500);
await page.evaluate((mode) => {
  const r = window.__game.race;
  if (mode === 'death') r.damage(r.player, 'front', 9, r.rivals[0], null, 'gun');
  else if (mode === 'finish') { r.pProg = 3 * 1e6; }
  else { r.rivals.slice(1).forEach((q) => r.damage(q, 'left', 3, r.player, null, 'gun')); r.damage(r.rivals[0], 'front', 0.5, r.player, null, 'gun'); r.damage(r.rivals[0], 'front', 9, r.player, null, 'gun'); }
}, mode);
// headless runs a few fps, so jump the sequence clock to each beat and let it settle
const beats = { kill: [0.5, 3.4, 6.4, 9.2], death: [0.5, 3, 6, 8.8], finish: [0.3, 1.5, 4.2, 7] }[mode];
for (const at of beats) {
  await page.evaluate((at) => { const r = window.__game.race; r.endE = Math.max(r.endE, at); }, at);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/end-${mode}-${at}.png` });
  console.log(at, await page.evaluate(() => { const r = window.__game.race; return [r.endShot, r.endE.toFixed(1), r.shown]; }));
}
await browser.close(); await server.close();
