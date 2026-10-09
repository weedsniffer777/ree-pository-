// Triangle budget: triangles and draw calls per car part and per scenery group.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5192 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://localhost:5192/endless.html?${process.argv[2] || 'ui=0'}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
console.log(await page.evaluate(() => {
  const g = window.__game, out = {};
  const add = (k, o) => {
    const geo = o.geometry, n = (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    out[k] ??= [0, 0]; out[k][0] += n; out[k][1]++;
  };
  const tag = (o) => { let p = o; while (p) { if (p.userData?.part) return 'part:' + p.userData.part; p = p.parent; } return null; };
  const player = g.car.model, rivals = g.race.rivals.map((r) => r.model);
  player.traverse((o) => { if (o.isMesh && o.visible) add('player ' + (tag(o) ?? 'chassis'), o); });
  rivals[0].traverse((o) => { if (o.isMesh && o.visible) add('rival0 ' + (tag(o) ?? 'chassis'), o); });
  const skip = new Set([player, ...rivals]);
  g.car.model.parent.parent.parent?.children.forEach(() => {});
  const scene = player; let root = player; while (root.parent) root = root.parent;
  for (const ch of root.children) { if ([...skip].some((m) => { let p = m; while (p) { if (p === ch) return true; p = p.parent; } return false; })) continue; ch.traverse((o) => { if (o.isMesh && o.visible) add('scene ' + (ch.name || ch.type), o); }); }
  return Object.entries(out).map(([k, [t, c]]) => `${String(Math.round(t / 1000)).padStart(5)}K tris ${String(c).padStart(4)} meshes  ${k}`).sort().reverse().join('\n');
}));
await browser.close(); await server.close();
