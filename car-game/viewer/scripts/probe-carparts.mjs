// Car triangle budget by piece (built fresh, before baking), biggest first.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5191 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
await page.goto('http://localhost:5191/endless.html?ui=0&race=0');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
console.log(await page.evaluate(async () => {
  const { buildStarterCoupe } = await import('/src/models/cars/starterCoupe.js');
  const car = buildStarterCoupe(), out = new Map();
  const tris = (o) => ((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
  const label = (o) => {
    const names = [];
    for (let p = o; p && p !== car; p = p.parent) names.unshift(p.name || p.userData.part || p.type);
    return names.slice(0, 2).join(' / ');
  };
  car.traverse((o) => { if (o.isMesh) { const k = label(o); const e = out.get(k) ?? [0, 0]; e[0] += tris(o); e[1]++; out.set(k, e); } });
  let total = 0; for (const [, [t]] of out) total += t;
  return `total ${Math.round(total)} tris\n` + [...out].sort((a, b) => b[1][0] - a[1][0]).slice(0, 30).map(([k, [t, n]]) => `${String(Math.round(t)).padStart(7)} ${String(n).padStart(4)}  ${k}`).join('\n');
}));
await browser.close(); await server.close();
