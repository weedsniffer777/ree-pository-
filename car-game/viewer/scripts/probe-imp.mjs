// Stand-in check: force every rival onto its baked stand-in and screenshot the field.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5190 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:5190/endless.html?ui=0&orbit=150');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
await page.evaluate(() => {
  for (const r of window.__game.race.rivals) {
    const s = r.sync.bind(r);
    r.sync = (dt) => { s(dt); r.model.visible = false; r.imp.mesh.visible = true; };
  }
});
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/imp-close.png' });
await browser.close(); await server.close();
