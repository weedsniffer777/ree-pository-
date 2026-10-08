// Dev kit: a small button top-right that opens a menu with the model viewer (the garage
// page in an overlay), tutorial replay, stats, and a full data reset.

const CSS = `
#devkit { position: fixed; top: calc(16px + env(safe-area-inset-top, 0px)); right: 16px; z-index: 20; font: 800 12px/1 'Overpass', system-ui, sans-serif; letter-spacing: 0.12em; text-transform: uppercase; }
#devkit button { font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; }
#devkit .open { background: rgba(22,23,26,0.72); color: #f2efe6; border: 2px solid #16171a; border-radius: 6px; padding: 7px 10px 6px; }
#devkit .open:hover, #devkit.on .open { background: #f2c21b; color: #16171a; }
#devkit .menu { position: absolute; right: 0; top: calc(100% + 6px); display: none; min-width: 190px; background: #f2efe6; border: 2px solid #16171a; border-radius: 6px; box-shadow: 0 6px 0 rgba(0,0,0,0.3); overflow: hidden; }
#devkit.on .menu { display: grid; }
#devkit .menu button { text-align: left; background: none; border: 0; border-bottom: 1px solid rgba(22,23,26,0.15); padding: 11px 12px 10px; color: #16171a; }
#devkit .menu button:last-child { border-bottom: 0; }
#devkit .menu button:hover { background: #f2c21b; }
#devkit .menu .danger { color: #b3170f; }
#devkit-viewer { position: fixed; inset: 0; z-index: 30; background: #16171a; }
#devkit-viewer iframe { width: 100%; height: 100%; border: 0; display: block; }
#devkit-viewer button { position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); right: 12px; font: 800 12px/1 'Overpass', system-ui, sans-serif; letter-spacing: 0.12em; text-transform: uppercase; background: #f2c21b; color: #16171a; border: 2px solid #16171a; border-radius: 6px; padding: 8px 12px 7px; cursor: pointer; }
`;

export function createDevKit({ viewerUrl, onStats, onOpenChange }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const el = document.createElement('div');
  el.id = 'devkit';
  el.innerHTML = `<button class="open">Dev kit</button>
    <div class="menu">
      <button data-a="viewer">Model viewer</button>
      <button data-a="stats">Toggle stats</button>
      <button data-a="tutorial">Replay tutorial</button>
      <button data-a="reset" class="danger">Reset all data</button>
    </div>`;
  document.body.append(el);
  for (const ev of ['pointerdown', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation());
  const toggle = (on = !el.classList.contains('on')) => { el.classList.toggle('on', on); onOpenChange?.(on); };
  el.querySelector('.open').addEventListener('click', () => toggle());
  addEventListener('keydown', (e) => { if (e.code === 'Escape') { closeViewer(); toggle(false); } });

  let overlay = null;
  const closeViewer = () => { if (overlay) { overlay.remove(); overlay = null; onOpenChange?.(false); } };
  const actions = {
    viewer() {
      toggle(false);
      overlay = document.createElement('div');
      overlay.id = 'devkit-viewer';
      overlay.innerHTML = `<iframe src="${viewerUrl}" title="Model viewer"></iframe><button>Back to the road</button>`;
      overlay.querySelector('button').addEventListener('click', closeViewer);
      document.body.append(overlay);
      onOpenChange?.(true);
    },
    stats() { onStats(); },
    tutorial() {
      try { localStorage.removeItem('endless.tutorial.v2'); } catch { /* ignore */ }
      location.reload();
    },
    reset() {
      if (!confirm('Reset all saved data (best distance, tutorial, settings)?')) return;
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
      location.reload();
    },
  };
  el.querySelectorAll('.menu button').forEach((b) => b.addEventListener('click', () => actions[b.dataset.a]()));
}
