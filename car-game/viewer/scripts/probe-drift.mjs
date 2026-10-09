// Drift check: step the player car with scripted inputs and print speed, heading, travel
// direction and slip angle. Usage: node scripts/probe-drift.mjs
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5197 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:5197/endless.html?map=${process.argv[2] || 'yard'}&ui=0&v0=${process.argv[3] ?? 32}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
const out = await page.evaluate(() => {
  const c = window.__game.car, H = 1 / 120, rows = [], deg = (a) => Math.round((a * 180) / Math.PI);
  const run = (sec, inp, label) => {
    for (let t = 0; t < sec; t += H) {
      c.step(H, { throttle: 0, brake: 0, steer: 0, boost: false, ...inp });
      if (Math.round(t / H) % 24 === 0) {
        const vh = Math.atan2(c.vx, c.vz), off = Math.atan2(Math.sin(c.yaw - vh), Math.cos(c.yaw - vh));
        rows.push(`${label.padEnd(10)} spd ${Math.hypot(c.vx, c.vz).toFixed(1).padStart(5)}  yaw ${String(deg(c.yaw)).padStart(5)}  travel ${String(deg(vh)).padStart(5)}  off ${String(deg(off)).padStart(5)}  D ${c.drift.toFixed(2)}`);
      }
    }
  };
  const y0 = c.yaw, v0 = Number(new URLSearchParams(location.search).get('v0') ?? 32); c.vx = Math.sin(y0) * v0; c.vz = Math.cos(y0) * v0;
  run(0.5, { throttle: 1 }, 'straight');
  run(0.7, { brake: 1, steer: 1 }, 'S+D');
  run(0.6, { throttle: 1, steer: 1 }, 'W+D');
  run(1.4, { throttle: 1 }, 'W');
  return rows.join('\n');
});
console.log(out);
await browser.close(); await server.close();
