// save.js — Simpan/muat progres Porto Sol di localStorage.
// Ditulis baru dari nol untuk rebuild round 2.

const SAVE_KEY = 'portosol-save-v1';

function storageAvailable() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch (e) {
    return false;
  }
}

export function saveGame(G) {
  if (!G || !storageAvailable()) return false;
  const data = {
    money: typeof G.money === 'number' ? G.money : 0,
    missionIndex: G.mission && typeof G.mission.index === 'number' ? G.mission.index : 0,
    health: typeof G.health === 'number' ? G.health : 100,
    playerX: G.player && typeof G.player.x === 'number' ? G.player.x : 0,
    playerZ: G.player && typeof G.player.z === 'number' ? G.player.z : 0,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      money: typeof data.money === 'number' ? data.money : 0,
      missionIndex: typeof data.missionIndex === 'number' ? data.missionIndex : 0,
      health: typeof data.health === 'number' ? data.health : 100,
      playerX: typeof data.playerX === 'number' ? data.playerX : 0,
      playerZ: typeof data.playerZ === 'number' ? data.playerZ : 0,
    };
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  if (!storageAvailable()) return false;
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}
