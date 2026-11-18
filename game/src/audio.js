// audio.js — Audio WebAudio murni Porto Sol (tanpa file eksternal).
// Semua suara disintesis; semua pemanggilan dibungkus try/catch agar game
// tetap berjalan bila audio diblokir browser.
// Ditulis baru dari nol untuk rebuild round 2.

export function createAudio() {
  const audio = {
    enabled: true,
    _ctx: null,
    _engineNodes: null,
  };

  function ensureCtx() {
    if (audio._ctx) {
      if (audio._ctx.state === 'suspended') {
        audio._ctx.resume().catch(() => {});
      }
      return audio._ctx;
    }
    const AC = (typeof window !== 'undefined')
      && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    audio._ctx = new AC();
    if (audio._ctx.state === 'suspended') {
      audio._ctx.resume().catch(() => {});
    }
    return audio._ctx;
  }

  // Satu nada sederhana dengan envelope naik/turun.
  function tone(freq, dur, type, volume, delay) {
    const ctx = ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume || 0.15), t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Ledakan noise pendek untuk tembakan.
  function noiseBurst(dur, volume) {
    const ctx = ensureCtx();
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.value = volume || 0.3;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  audio.play = function play(name) {
    if (!audio.enabled) return;
    try {
      switch (name) {
        case 'shot':
          noiseBurst(0.12, 0.3);
          tone(160, 0.08, 'square', 0.12, 0);
          break;
        case 'pickup':
          tone(660, 0.12, 'sine', 0.18, 0);
          tone(880, 0.18, 'sine', 0.18, 0.1);
          break;
        case 'mission':
          tone(523, 0.15, 'triangle', 0.2, 0);
          tone(659, 0.15, 'triangle', 0.2, 0.14);
          tone(784, 0.3, 'triangle', 0.22, 0.28);
          break;
        case 'siren': {
          // Wail bolak-balik ~1,2 detik (dipanggil ulang selagi wanted > 0).
          const ctx = ensureCtx();
          if (!ctx) return;
          const t0 = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(700, t0);
          osc.frequency.linearRampToValueAtTime(1100, t0 + 0.6);
          osc.frequency.linearRampToValueAtTime(700, t0 + 1.2);
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + 1.25);
          break;
        }
        case 'click':
          tone(1000, 0.05, 'sine', 0.12, 0);
          break;
        default:
          break;
      }
    } catch (e) { /* audio tidak boleh mematikan game */ }
  };

  // Dengung mesin loop saat mengendarai; frekuensi mengikuti kecepatan.
  audio.engine = function engine(on, speed) {
    try {
      if (!on) {
        if (audio._engineNodes) {
          const n = audio._engineNodes;
          audio._engineNodes = null;
          try { n.gain.gain.setTargetAtTime(0, n.ctx.currentTime, 0.05); } catch (e) {}
          try { n.osc.stop(n.ctx.currentTime + 0.3); } catch (e) {}
        }
        return;
      }
      const ctx = ensureCtx();
      if (!ctx) return;
      const s = typeof speed === 'number' ? Math.abs(speed) : 0;
      const freq = 45 + s * 2.2;
      if (!audio._engineNodes) {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        gain.gain.value = 0.05;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audio._engineNodes = { osc, filter, gain, ctx };
      } else {
        const n = audio._engineNodes;
        n.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
        n.filter.frequency.setTargetAtTime(400 + s * 18, ctx.currentTime, 0.1);
      }
    } catch (e) { /* audio tidak boleh mematikan game */ }
  };

  return audio;
}
