// save.js — Porto Sol: simpan / muat progres lewat localStorage.
// Semua akses dibungkus try/catch: mode privat atau storage penuh tidak
// boleh melempar ke game.
const KEY = 'porto-sol-save-v1';

export function saveGame(G) {
  try {
    const p = G.player || {};
    const data = {
      version: 1,
      cash: p.cash || 0,
      health: p.health ?? 100,
      missionsDone: (G.stats && G.stats.missionsDone) || 0,
      time: typeof G.time === 'number' ? G.time : 10,
      pos: p.pos
        ? { x: p.pos.x || 0, z: p.pos.z || 0, heading: p.heading || 0 }
        : { x: 0, z: 0, heading: 0 },
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || s.version !== 1) return null;
    return s;
  } catch { return null; }
}

export function hasSave() {
  try { return localStorage.getItem(KEY) !== null; } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* abaikan */ }
}
