// Armor check: strip the player's rear and left armor stage by stage and screenshot it.
// Usage: node scripts/probe-armor.mjs
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5195 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack?.split('\n').slice(0, 4).join(' | ')));
await page.goto('http://localhost:5195/endless.html?map=yard&ui=0&orbit=150');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => {
  const r = window.__game.race, p = r.player;
  r.damage(p, 'back', 0.4, null, null, 'wall'); r.damage(p, 'back', 0.3, null, null, 'wall');
  r.damage(p, 'left', 0.4, null, null, 'wall'); r.damage(p, 'left', 0.3, null, null, 'wall');
  p.armor.core = 1;
  return { scars: r.scars.list.length, lamps: p.lamps.out, back: p.armor.z.back };
}));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/armor-strip.png' });
await browser.close(); await server.close();
