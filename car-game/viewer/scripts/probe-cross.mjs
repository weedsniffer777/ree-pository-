// Track self-crossing check: for each map, report places where two far-apart parts of
// the loop pass within 14 m of each other, with their road heights.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5193 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const map of ['desert', 'salt', 'dustbowl', 'yard']) {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  await page.goto(`http://localhost:5193/endless.html?map=${map}&ui=0`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
  const out = await page.evaluate(async () => {
    const { S, LOOP } = await import('/src/endless/route.js');
    const N = LOOP.n, hits = [];
    for (let a = 0; a < N; a += 4) for (let b = a + 60; b < N; b += 4) {
      if (N - b + a < 60) continue;
      const d = Math.hypot(S.px[a] - S.px[b], S.pz[a] - S.pz[b]);
      if (d < 14 && !hits.some((h) => Math.abs(h.a - a) < 40 && Math.abs(h.b - b) < 40)) hits.push({ a, b, d: Math.round(d), ya: +S.y[a].toFixed(1), yb: +S.y[b].toFixed(1) });
    }
    return { N, hits };
  });
  console.log(map, JSON.stringify(out));
  await page.close();
}
await browser.close(); await server.close();
