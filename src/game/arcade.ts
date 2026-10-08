// A tiny shared engine for the Play tab's arcade games (Offer Catcher, Follow-Up Flight, Notice
// Period Dash). Same approach as Ghost Blasters: a plain 2D canvas, no libraries. It handles sizing
// (sharp on high-density screens), the frame loop, touch / mouse / keyboard input, pausing when the
// tab is hidden, and loading the shared artwork. Each game only writes reset, update and draw.
//
// Calm mode (reduced motion): games skip screen shake and keep particles to a minimum.

export type ArcadeState = "ready" | "playing" | "paused" | "over";
export type ArcadeHud = { score: number; lives?: number; combo?: number };
export type ArcadeOpts = { calm: boolean; onState: (s: ArcadeState) => void; onHud: (h: ArcadeHud) => void; onOver: (score: number, detail: string) => void };

// Palette (matches the site and Ghost Blasters).
export const C = { violet: "#6D28D9", lilac: "#9F7AEA", cream: "#F2E9D8", ink: "#16111D", plum: "#2A1838", green: "#22C55E", amber: "#F59E0B", red: "#EF4444", white: "#FFFFFF" };

// ---------- artwork (the Ghost Blasters set plus the Ghosted mark) ----------
const ART = {
  ghoster1: "/Ghost%20Blasters/ghoster-01.png", ghoster2: "/Ghost%20Blasters/ghoster-02.png",
  recruiter1: "/Ghost%20Blasters/green-flag-recruiter-01.png", recruiter2: "/Ghost%20Blasters/green-flag-recruiter-02.png",
  resume: "/Ghost%20Blasters/resume-projectile.png", mark: "/ghosted-mark.png",
} as const;
export type ArtName = keyof typeof ART;
const images = new Map<ArtName, HTMLImageElement>();
let loading: Promise<void> | null = null;
export function preloadArcadeArt() {
  loading ??= Promise.all((Object.keys(ART) as ArtName[]).map((n) => new Promise<void>((res) => {
    const img = new Image(); img.decoding = "async";
    img.onload = () => { images.set(n, img); res(); }; img.onerror = () => res();
    img.src = ART[n];
  }))).then(() => undefined);
  return loading;
}
// Scaled once per size into an offscreen canvas, so each frame only copies a small bitmap.
const scaled = new Map<string, HTMLCanvasElement>();
export function sprite(name: ArtName, px: number) {
  const size = Math.max(8, Math.round(px)), key = `${name}@${size}`;
  const hit = scaled.get(key); if (hit) return hit;
  const img = images.get(name); if (!img) return null;
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d")!; g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, size, size);
  scaled.set(key, c); return c;
}

// ---------- small drawing helpers in the site's thick-outline style ----------
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function inked(g: CanvasRenderingContext2D, fill: string, line = 3) { g.fillStyle = fill; g.fill(); g.lineWidth = line; g.strokeStyle = C.ink; g.stroke(); }
// An envelope (an offer letter), centred on x, y.
export function envelope(g: CanvasRenderingContext2D, x: number, y: number, s: number, fill = C.cream, seal = C.green) {
  const w = s, h = s * 0.68;
  roundRect(g, x - w / 2, y - h / 2, w, h, s * 0.1); inked(g, fill, Math.max(2, s * 0.07));
  g.beginPath(); g.moveTo(x - w / 2 + 2, y - h / 2 + 2); g.lineTo(x, y + h * 0.08); g.lineTo(x + w / 2 - 2, y - h / 2 + 2); g.lineWidth = Math.max(2, s * 0.06); g.strokeStyle = C.ink; g.stroke();
  g.beginPath(); g.arc(x, y + h * 0.06, s * 0.13, 0, Math.PI * 2); inked(g, seal, Math.max(1.5, s * 0.05));
}
// A red flag on a pole, centred on x, y.
export function redFlag(g: CanvasRenderingContext2D, x: number, y: number, s: number, wave = 0) {
  const lw = Math.max(2, s * 0.08);
  g.beginPath(); g.moveTo(x - s * 0.3, y - s * 0.5); g.lineTo(x - s * 0.3, y + s * 0.5); g.lineWidth = lw * 1.4; g.strokeStyle = C.ink; g.lineCap = "round"; g.stroke();
  g.beginPath(); g.moveTo(x - s * 0.3, y - s * 0.48);
  g.quadraticCurveTo(x + s * 0.05, y - s * 0.6 + wave * s * 0.08, x + s * 0.45, y - s * 0.4);
  g.lineTo(x + s * 0.45, y - s * 0.02);
  g.quadraticCurveTo(x + s * 0.05, y - s * 0.18 - wave * s * 0.08, x - s * 0.3, y - s * 0.06);
  g.closePath(); inked(g, C.red, lw); g.lineCap = "butt";
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Floater = { x: number; y: number; text: string; life: number; color: string };

export abstract class Arcade {
  protected g: CanvasRenderingContext2D;
  protected w = 0; protected h = 0; protected dpr = 1;
  protected state: ArcadeState = "ready";
  protected t = 0; // seconds into the current run
  protected keys = new Set<string>();
  protected pointer: { x: number; y: number; down: boolean } | null = null;
  protected particles: Particle[] = [];
  protected floaters: Floater[] = [];
  protected shakeT = 0;
  private raf = 0; private last = 0; private cleanup: (() => void)[] = [];

  constructor(protected canvas: HTMLCanvasElement, wrap: HTMLElement, protected opts: ArcadeOpts) {
    this.g = canvas.getContext("2d")!;
    this.resize();
    const ro = new ResizeObserver(() => this.resize()); ro.observe(wrap);
    const pos = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const pdown = (e: PointerEvent) => { canvas.setPointerCapture?.(e.pointerId); this.pointer = { ...pos(e), down: true }; if (this.state === "playing") this.press(); };
    const pmove = (e: PointerEvent) => { this.pointer = { ...pos(e), down: this.pointer?.down ?? false }; };
    const pup = () => { if (this.pointer) this.pointer.down = false; this.release(); };
    canvas.addEventListener("pointerdown", pdown); canvas.addEventListener("pointermove", pmove); canvas.addEventListener("pointerup", pup); canvas.addEventListener("pointercancel", pup);
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (k === "p" || k === "escape") { if (this.state === "playing") this.pause(); else if (this.state === "paused") this.resume(); return; }
      if (this.state === "playing" && !this.keys.has(k) && (k === " " || k === "arrowup" || k === "w")) this.press();
      if (this.state === "playing" && (k === "arrowdown" || k === "s")) this.duck(true);
      this.keys.add(k);
    };
    const up = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); this.keys.delete(k); if (k === " " || k === "arrowup" || k === "w") this.release(); if (k === "arrowdown" || k === "s") this.duck(false); };
    const blur = () => { this.keys.clear(); if (this.state === "playing") this.pause(); };
    const vis = () => { if (document.hidden && this.state === "playing") this.pause(); };
    wrap.addEventListener("keydown", down); wrap.addEventListener("keyup", up); wrap.addEventListener("blur", blur); document.addEventListener("visibilitychange", vis);
    this.cleanup.push(() => { ro.disconnect(); canvas.removeEventListener("pointerdown", pdown); canvas.removeEventListener("pointermove", pmove); canvas.removeEventListener("pointerup", pup); canvas.removeEventListener("pointercancel", pup);
      wrap.removeEventListener("keydown", down); wrap.removeEventListener("keyup", up); wrap.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", vis); });
    // The first reset waits for the first frame: a subclass's own fields aren't set up until its
    // constructor finishes, after this one.
    this.raf = requestAnimationFrame(this.loop);  }
  private ready = false;

  start() { this.ready = true; this.t = 0; this.particles = []; this.floaters = []; this.shakeT = 0; this.reset(); this.setState("playing"); }
  pause() { if (this.state === "playing") this.setState("paused"); }
  resume() { if (this.state === "paused") { this.last = performance.now(); this.setState("playing"); } }
  setCalm(calm: boolean) { this.opts.calm = calm; }
  destroy() { cancelAnimationFrame(this.raf); this.cleanup.forEach((f) => f()); }

  // Hooks for games: a tap / Space / Up (press), its release, and holding Down (duck).
  protected press() {}
  protected release() {}
  protected duck(_on: boolean) {}
  protected abstract reset(): void;
  protected abstract update(dt: number): void;
  protected abstract draw(g: CanvasRenderingContext2D): void;

  protected setState(s: ArcadeState) { this.state = s; this.opts.onState(s); }
  protected gameOver(score: number, detail: string) {
    if (this.state !== "playing") return;
    this.shake(0.4); this.setState("over"); this.opts.onOver(score, detail);
  }
  protected shake(sec: number) { if (!this.opts.calm) this.shakeT = Math.max(this.shakeT, sec); }
  protected burst(x: number, y: number, color: string, n = 14) {
    const count = this.opts.calm ? Math.ceil(n / 4) : n;
    for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220; this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: 0.4 + Math.random() * 0.4, color, size: 3 + Math.random() * 4 }); }
  }
  protected float(x: number, y: number, text: string, color: string = C.cream) { this.floaters.push({ x, y, text, life: 0, color }); }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    this.onResize();
  }
  protected onResize() {}

  private loop = (now: number) => {
    if (!this.ready) { this.ready = true; this.reset(); }
    const dt = Math.min(0.033, this.last ? (now - this.last) / 1000 : 0); this.last = now;
    if (this.state === "playing") { this.t += dt; this.update(dt); }
    for (const p of this.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const f of this.floaters) { f.life += dt; f.y -= 50 * dt; }
    this.floaters = this.floaters.filter((f) => f.life < 0.8);
    this.shakeT = Math.max(0, this.shakeT - dt);
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.shakeT > 0) g.translate((Math.random() - 0.5) * 12 * this.shakeT, (Math.random() - 0.5) * 12 * this.shakeT);
    this.draw(g);
    for (const p of this.particles) { g.globalAlpha = 1 - p.life / p.max; g.fillStyle = p.color; g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    g.globalAlpha = 1;
    g.font = "700 18px 'Space Grotesk', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const f of this.floaters) { g.globalAlpha = 1 - f.life / 0.8; g.lineWidth = 4; g.strokeStyle = C.ink; g.strokeText(f.text, f.x, f.y); g.fillStyle = f.color; g.fillText(f.text, f.x, f.y); }
    g.globalAlpha = 1;
    this.raf = requestAnimationFrame(this.loop);
  };
}

// A starry night sky (shared backdrop), with stars that drift slowly unless calm.
export function nightSky(g: CanvasRenderingContext2D, w: number, h: number, t: number, calm: boolean) {
  const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, C.ink); grad.addColorStop(1, C.plum);
  g.fillStyle = grad; g.fillRect(-20, -20, w + 40, h + 40);
  g.fillStyle = "rgba(242,233,216,0.55)";
  for (let i = 0; i < 46; i++) { const x = ((i * 137.5 + (calm ? 0 : t * (6 + (i % 5) * 3))) % (w + 10)), y = (i * 89.3) % (h * 0.85); const s = 1 + (i % 3); g.fillRect(w - x, y, s, s); }
}
