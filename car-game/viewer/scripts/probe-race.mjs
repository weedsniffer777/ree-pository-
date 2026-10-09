// Race smoke test: load a map, force a gun hit on the player, step every AI car ~15 s,
// print errors and where the rivals got to. Usage: node scripts/probe-race.mjs "map=yard&ui=1" desk 500
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5199 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const phone = process.argv[3] === 'phone';
const page = await browser.newPage(phone ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack?.split('\n').slice(0, 4).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
await page.goto(`http://localhost:5199/endless.html?${process.argv[2] || 'map=yard&ui=1'}`);
try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 }); console.log('ready'); } catch { console.log('NEVER READY'); }
await page.waitForTimeout(Number(process.argv[4] || 4000));
console.log(await page.evaluate(() => {
  const r = window.__game?.race, c = window.__game.car;
  try {
    const THREE_V = r.holes.tv.constructor;
    const p = new THREE_V(c.x, c.y + 0.8, c.z + 1.5), d = new THREE_V(0, 0, -1);
    r.damage(r.player, 'front', 0.01, r.rivals[0], p, 'gun', d); window.__hud_crack_test = true; for (let k = 0; k < 1800; k++) { r.stepAI(1 / 120); if (k % 4 === 3) r.update(1 / 30); }
    return { ok: true, t: r.t, rivals: r.rivals.map((q) => [q.name, q.personality, q.behaviour, q.target?.ref?.name ?? '-', Math.round(q.v), Math.round(q.car.boost * 100)]) };
  } catch (e) { return { err: String(e) }; }
}));
await browser.close(); await server.close();
