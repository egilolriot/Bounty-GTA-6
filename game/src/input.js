// input.js — Input keyboard Porto Sol (tanpa dependensi).
// Ditulis baru dari nol untuk rebuild round 2.

export function createInput() {
  const input = { keys: new Set() };

  function onKeyDown(e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown'
      || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
    }
    input.keys.add(e.code);
  }

  function onKeyUp(e) {
    input.keys.delete(e.code);
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  return input;
}

export function isDown(input, code) {
  if (!input || !input.keys) return false;
  return input.keys.has(code);
}
