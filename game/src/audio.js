// audio.js — Porto Sol: semua suara disintesis dengan WebAudio.
// Tanpa file audio, tanpa jaringan. AudioContext dibuat malas saat resume()
// dipanggil pertama kali, karena browser menuntut gesture pengguna.
// Setiap metode suara aman dipanggil sebelum resume(): no-op bila context
// belum ada.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = true; // mulai bisu sampai gesture pertama
    this.speed = 0; // m/s; dipakai bila tidak ada G yang di-bind
    this.target = null; // G, bila di-bind — update() membaca kecepatan dari sini
    this._eng = null; // { osc, gain, filter } suara mesin
    this._siren = null; // { osc, lfo, gain } sirene polisi
    this._musicOn = false;
    this._musicTimer = null;
    this._nextNote = 0;
    this._step = 0;
    this._noiseBuf = null;
  }

  // Biarkan update() membaca kecepatan mobil pemain langsung dari G.
  bind(G) {
    this.target = G;
    return this;
  }

  _ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      // Buffer noise putih sepanjang 1 detik, dipakai ulang oleh _noise().
      const len = this.ctx.sampleRate;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { return false; }
    return true;
  }

  resume() {
    if (!this._ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.setMuted(false);
    this._startEngine();
    if (this._musicOn) this._startMusic();
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  // Satu bunyi noise tersaring dengan envelope turun.
  _noise(dur, filterType, freq, gainVal, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // Satu nada osilator dengan attack singkat, opsional meluncur ke slideTo.
  _tone(type, freq, dur, gainVal, when = 0, slideTo = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainVal, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  shoot() {
    if (!this.ctx) return;
    this._noise(0.12, 'highpass', 1200, 0.5);
    this._tone('sine', 160, 0.14, 0.5, 0, 55);
  }

  crash() {
    if (!this.ctx) return;
    this._noise(0.4, 'lowpass', 700, 0.8);
    this._tone('sine', 90, 0.3, 0.6, 0, 40);
  }

  horn() {
    this._tone('square', 340, 0.28, 0.18);
    this._tone('square', 428, 0.28, 0.18);
  }

  hurt() {
    this._tone('sine', 140, 0.18, 0.35, 0, 70);
  }

  pickup() {
    this._tone('sine', 880, 0.12, 0.25);
    this._tone('sine', 1318, 0.2, 0.25, 0.1);
  }

  mission() {
    // Arpeggio naik: A3 C#4 E4 A4.
    [220, 277, 330, 440].forEach((f, i) => this._tone('triangle', f, 0.22, 0.25, i * 0.11));
  }

  siren(on) {
    if (on) {
      if (!this._ensure() || this._siren) return;
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 800;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.55;
      const lg = this.ctx.createGain();
      lg.gain.value = 180;
      lfo.connect(lg);
      lg.connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.value = 0.045;
      o.connect(g);
      g.connect(this.master);
      o.start();
      lfo.start();
      this._siren = { osc: o, lfo, gain: g };
    } else if (this._siren) {
      try {
        this._siren.osc.stop();
        this._siren.lfo.stop();
      } catch { /* sudah berhenti */ }
      this._siren = null;
    }
  }

  music(on) {
    this._musicOn = !!on;
    if (on) this._startMusic();
    else if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  }

  _startEngine() {
    if (!this.ctx || this._eng) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    f.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    o.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start();
    this._eng = { osc: o, gain: g, filter: f };
  }

  _startMusic() {
    if (!this.ctx || this._musicTimer) return;
    this._nextNote = this.ctx.currentTime + 0.1;
    this._step = 0;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 90);
  }

  _scheduleMusic() {
    if (!this.ctx) return;
    // Synthwave A-minor: root bass A F C G, pad chord, hat tiap ketuk 8.
    const bass = [55, 43.65, 65.41, 49];
    const pads = [
      [220, 261.6, 329.6],
      [174.6, 220, 261.6],
      [261.6, 329.6, 392],
      [196, 246.9, 293.7],
    ];
    while (this._nextNote < this.ctx.currentTime + 0.25) {
      const step = this._step % 16;
      const bar = Math.floor(this._step / 16) % 4;
      const dt = this._nextNote - this.ctx.currentTime;
      if (step % 4 === 0) this._tone('triangle', bass[bar], 0.5, 0.10, dt);
      if (step === 0) pads[bar].forEach((f) => this._tone('sine', f, 1.9, 0.025, dt));
      if (step % 2 === 0) this._noise(0.03, 'highpass', 6000, 0.03, dt);
      this._nextNote += 0.22; // ketuk 8 pada ~136 BPM
      this._step++;
    }
  }

  update(dt) {
    if (!this.ctx || !this._eng) return;
    let v = this.speed || 0;
    if (this.target && this.target.player) {
      const p = this.target.player;
      v = (p.inCar ? p.inCar.speed : p.speed) || 0;
    }
    const t = this.ctx.currentTime;
    const driving = this.target ? !this.target.player?.onFoot : v > 0.5;
    const abs = Math.abs(v);
    this._eng.osc.frequency.setTargetAtTime(45 + Math.min(90, abs * 2.2), t, 0.08);
    this._eng.filter.frequency.setTargetAtTime(280 + Math.min(900, abs * 22), t, 0.1);
    this._eng.gain.gain.setTargetAtTime(this.muted ? 0 : (driving ? 0.05 : 0.02), t, 0.1);
    // Sirene meraung selama ada wanted, diam saat wanted 0.
    const wantSiren = !!(this.target && (this.target.wanted || 0) > 0);
    if (wantSiren && !this._siren) this.siren(true);
    else if (!wantSiren && this._siren) this.siren(false);
  }
}
