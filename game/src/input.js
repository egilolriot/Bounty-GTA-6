// Porto Sol — Input: keyboard + mouse dengan edge detection (pressed).
// Dipakai semua modul aktor: WASD mengemudi/berjalan, Space lompat/handbrake,
// klik mouse untuk tembak, pointer lock opsional untuk kamera orang ketiga.
export class Input {
  constructor(canvas) {
    this.canvas = canvas || null;
    // Set tombol yang sedang ditekan saat ini, dan salinannya dari frame lalu.
    this.keys = new Set();
    this.prevKeys = new Set();
    this.buttons = new Set();
    this.prevButtons = new Set();
    // Delta mouse sejak frame terakhir (hanya terisi saat pointer lock aktif).
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;

    // Tombol yang tidak boleh menggulir halaman saat dipakai bermain.
    const SCROLL_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];

    this._onKeyDown = (e) => {
      if (SCROLL_KEYS.includes(e.code)) e.preventDefault();
      // Abaikan auto-repeat: Set sudah berisi kode, pressed() tetap edge.
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    // Kehilangan fokus = semua tombol dilepas, supaya karakter tidak jalan sendiri.
    this._onBlur = () => {
      this.keys.clear();
      this.buttons.clear();
    };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      this.buttons.add(e.button);
      // Klik pertama di canvas mengunci pointer (opsional, gagal diam-diam).
      if (this.canvas && e.target === this.canvas && !this.locked) {
        try { this.canvas.requestPointerLock?.(); } catch { /* abaikan */ }
      }
    };
    this._onMouseUp = (e) => {
      this.buttons.delete(e.button);
    };
    this._onLockChange = () => {
      this.locked = typeof document !== 'undefined' &&
        document.pointerLockElement === this.canvas;
    };
    this._onContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('mousemove', this._onMouseMove);
    if (this.canvas) this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    if (this.canvas) this.canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  // Tombol sedang ditahan?
  isDown(code) {
    return this.keys.has(code);
  }

  // Ada satu saja dari daftar kode yang sedang ditahan?
  anyDown(codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  // Baru ditekan di frame ini (turun sekarang, tidak turun di frame lalu).
  pressed(code) {
    return this.keys.has(code) && !this.prevKeys.has(code);
  }

  anyPressed(codes) {
    for (const c of codes) if (this.pressed(c)) return true;
    return false;
  }

  // Tombol mouse (0 kiri, 1 tengah, 2 kanan) sedang ditahan?
  mouseDown(button) {
    return this.buttons.has(button);
  }

  mousePressed(button) {
    return this.buttons.has(button) && !this.prevButtons.has(button);
  }

  // Dipanggil sekali di akhir tiap frame: bekukan edge, nolkan delta mouse.
  update() {
    this.prevKeys = new Set(this.keys);
    this.prevButtons = new Set(this.buttons);
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('mousemove', this._onMouseMove);
    if (this.canvas) this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    if (this.canvas) this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }
}
