// Ghost Blasters: a small arcade game on a plain 2D canvas, no libraries.
//
// You fly a candidate's rocketship. Bad hiring practices (never people) drift in and close on you:
// shoot them with résumés and they split into smaller, faster pieces. Green Flag Recruiters drift
// across now and then; touch one to collect an offer letter, which gives Experience (the score) and
// a level up, and everything speeds up a little. One touch from a bad practice ends the run.
//
// Art lives in public/Ghost Blasters (see ASSETS.md). The ship, flames, résumé, Ghoster and
// recruiter are images; the other four bad practices are drawn here in the same thick-outline,
// flat-fill style until their artwork exists. Images are scaled once into offscreen canvases per
// size, so each frame only copies small bitmaps.
//
// Calm mode (reduced motion): no screen shake, sprites hold a single frame, a slower speed ramp,
// fewer particles and a still starfield.

export type EnemyKind = "ghoster" | "rounds" | "phantom" | "lowball" | "takehome";
export type Controls = "both" | "arrows" | "wasd";
export type GameState = "ready" | "playing" | "paused" | "over";
export type RunResult = { xp: number; level: number; offers: number; seconds: number; killer: EnemyKind };
export type HudState = { xp: number; level: number; offers: number };

type Opts = {
  calm: boolean;
  tone: "sassy" | "calm";
  controls: Controls;
  onState: (s: GameState) => void;
  onHud: (h: HudState) => void;
  onOver: (r: RunResult) => void;
  onOffer?: (xp: number, level: number) => void;
};

const ART = "/Ghost%20Blasters/";
const IMAGES = {
  ship: "player-ship.png", flame: "thruster-flame.png", flameSmall: "thruster-flame-small.png", resume: "resume-projectile.png",
  ghoster1: "ghoster-01.png", ghoster2: "ghoster-02.png", recruiter1: "green-flag-recruiter-01.png", recruiter2: "green-flag-recruiter-02.png",
} as const;
type ImageName = keyof typeof IMAGES;

// Palette (matches the site): violet, light violet, cream, night plum, green, amber, red.
const C = { violet: "#6D28D9", lilac: "#9F7AEA", cream: "#F2E9D8", ink: "#16111D", green: "#22C55E", amber: "#F59E0B", red: "#EF4444", plum: "#4A1F5C" };

// ---------- images, loaded once for every game on the page ----------

const loaded = new Map<ImageName, HTMLImageElement>();
let loading: Promise<void> | null = null;
export function preloadArt() {
  if (loading) return loading;
  loading = Promise.all((Object.keys(IMAGES) as ImageName[]).map((name) => new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => { loaded.set(name, img); resolve(); };
    img.onerror = () => resolve(); // a missing image falls back to a drawn shape
    img.src = ART + IMAGES[name];
  }))).then(() => undefined);
  return loading;
}

// A loaded source image (after preloadArt), for things drawn outside the game such as the share card.
export const artImage = (name: ImageName) => loaded.get(name) ?? null;

// Pre-scaled copies, keyed by name and pixel size (the source PNGs are 1254px squares).
const scaled = new Map<string, HTMLCanvasElement>();
function sprite(name: ImageName, px: number) {
  const size = Math.max(8, Math.round(px));
  const key = `${name}@${size}`;
  let c = scaled.get(key);
  if (c) return c;
  const img = loaded.get(name);
  if (!img) return null;
  c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, size, size);
  scaled.set(key, c);
  return c;
}

// ---------- entities ----------

type Vec = { x: number; y: number };
type Enemy = { kind: EnemyKind; tier: 1 | 2 | 3; x: number; y: number; vx: number; vy: number; r: number; spin: number; angle: number; phase: number; hp: number; flash: number };
type Bullet = { x: number; y: number; vx: number; vy: number; life: number; angle: number };
type Recruiter = { x: number; y: number; vx: number; vy: number; r: number; phase: number; dir: 1 | -1 };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; spin: number; angle: number; shape: "dot" | "shard" | "confetti" };
type Floater = { x: number; y: number; text: string; life: number; color: string; big: boolean };
type Star = { x: number; y: number; z: number; tw: number };

const KINDS: EnemyKind[] = ["ghoster", "rounds", "phantom", "lowball", "takehome"];
const TIER_R = { 3: 34, 2: 22, 1: 13 } as const;
const TIER_XP = { 3: 15, 2: 10, 1: 5 } as const;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]!;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angleTo = (from: number, to: number, max: number) => { let d = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI; d = clamp(d, -max, max); return from + d; };

export class GhostBlasters {
  private ctx: CanvasRenderingContext2D;
  private w = 0; private h = 0; private dpr = 1; private unit = 1;
  private state: GameState = "ready";
  private raf = 0; private last = 0; private time = 0; private runTime = 0;
  private keys = new Set<string>();
  private stick: Vec = { x: 0, y: 0 };
  private touchFire = false;
  private ship = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, cool: 0, moving: false, alive: true, invuln: 0 };
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private recruiters: Recruiter[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private stars: Star[] = [];
  private xp = 0; private level = 1; private offers = 0;
  private spawnIn = 0; private recruiterIn = 0; private shake = 0;
  private killer: EnemyKind = "ghoster";
  private quipIn = 0; // seconds until the next pop-up line is allowed
  private overDelay = 0;
  private cleanup: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, private keyTarget: HTMLElement, private opts: Opts) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    const down = (e: KeyboardEvent) => this.onKey(e, true);
    const up = (e: KeyboardEvent) => this.onKey(e, false);
    const blur = () => this.keys.clear();
    // A hidden tab pauses the run; it never resumes by itself.
    const vis = () => { if (document.visibilityState === "hidden" && this.state === "playing") this.pause(); };
    keyTarget.addEventListener("keydown", down);
    keyTarget.addEventListener("keyup", up);
    keyTarget.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    this.cleanup.push(() => { ro.disconnect(); keyTarget.removeEventListener("keydown", down); keyTarget.removeEventListener("keyup", up); keyTarget.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", vis); });
    void preloadArt().then(() => this.draw());
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- public controls ----------

  setControls(c: Controls) { this.opts.controls = c; }
  setTone(t: "sassy" | "calm") { this.opts.tone = t; }
  setCalm(calm: boolean) { this.opts.calm = calm; this.makeStars(); }
  setStick(x: number, y: number) { this.stick = { x, y }; }
  setFire(on: boolean) { this.touchFire = on; }
  getState() { return this.state; }

  start() {
    this.enemies = []; this.bullets = []; this.recruiters = []; this.particles = []; this.floaters = [];
    this.xp = 0; this.level = 1; this.offers = 0; this.runTime = 0; this.overDelay = 0;
    this.ship = { x: this.w / 2, y: this.h / 2, vx: 0, vy: 0, angle: 0, cool: 0, moving: false, alive: true, invuln: 1.6 };
    this.spawnIn = 0.6; this.recruiterIn = rand(4, 6);
    for (let i = 0; i < 3; i++) this.spawnEnemy(3);
    this.float(this.w / 2, this.h * 0.32, this.opts.tone === "calm" ? "Go!" : pick(["Applications open. Good luck.", "Résumés loaded.", "Interview season. Brace."]), C.cream, true);
    this.quipIn = 2;
    this.setState("playing");
    this.hud();
  }
  pause() { if (this.state === "playing") { this.keys.clear(); this.setState("paused"); } }
  resume() { if (this.state === "paused") { this.last = performance.now(); this.setState("playing"); } }
  destroy() { cancelAnimationFrame(this.raf); this.cleanup.forEach((f) => f()); }

  // ---------- internals ----------

  private setState(s: GameState) { this.state = s; this.opts.onState(s); }
  private hud() { this.opts.onHud({ xp: this.xp, level: this.level, offers: this.offers }); }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(240, r.width); this.h = Math.max(240, r.height);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    // Everything scales with the smaller side, so a phone gets the same game, just smaller.
    this.unit = clamp(Math.min(this.w, this.h) / 620, 0.62, 1.25);
    this.ship.x = clamp(this.ship.x || this.w / 2, 0, this.w); this.ship.y = clamp(this.ship.y || this.h / 2, 0, this.h);
    this.makeStars();
    if (this.state !== "playing") this.draw();
  }

  private makeStars() {
    const n = Math.round((this.w * this.h) / 5200);
    this.stars = Array.from({ length: n }, () => ({ x: Math.random() * this.w, y: Math.random() * this.h, z: pick([0.3, 0.6, 1]), tw: Math.random() * 6 }));
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const game = [" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"];
    if (game.includes(k) && (this.state === "playing" || k === " ")) e.preventDefault(); // no page scroll while playing
    if (down && (k === "p" || k === "Escape")) { if (this.state === "playing") this.pause(); else if (this.state === "paused") this.resume(); return; }
    if (down && (k === "Enter" || k === " ") && (this.state === "ready" || (this.state === "over" && this.overDelay <= 0))) { this.start(); return; }
    if (down && k === " " && this.state === "paused") { this.resume(); return; }
    if (down) this.keys.add(k); else this.keys.delete(k);
  }

  private dir(): Vec {
    const c = this.opts.controls, k = this.keys;
    const arrows = c !== "wasd", wasd = c !== "arrows";
    let x = 0, y = 0;
    if ((arrows && k.has("ArrowLeft")) || (wasd && k.has("a"))) x -= 1;
    if ((arrows && k.has("ArrowRight")) || (wasd && k.has("d"))) x += 1;
    if ((arrows && k.has("ArrowUp")) || (wasd && k.has("w"))) y -= 1;
    if ((arrows && k.has("ArrowDown")) || (wasd && k.has("s"))) y += 1;
    x += this.stick.x; y += this.stick.y;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  private speedMul() { return 1 + (this.level - 1) * (this.opts.calm ? 0.06 : 0.11); }

  private spawnEnemy(tier: 1 | 2 | 3, at?: Vec, kind?: EnemyKind) {
    const u = this.unit;
    let x: number, y: number;
    if (at) { x = at.x; y = at.y; } else {
      // From a random edge, never on top of the ship.
      const side = Math.floor(Math.random() * 4), m = 40 * u;
      x = side === 0 ? -m : side === 1 ? this.w + m : rand(0, this.w);
      y = side === 2 ? -m : side === 3 ? this.h + m : rand(0, this.h);
    }
    const a = Math.atan2(this.ship.y - y, this.ship.x - x) + rand(-0.6, 0.6);
    const sp = (tier === 3 ? rand(28, 46) : tier === 2 ? rand(46, 70) : rand(66, 96)) * u * this.speedMul();
    this.enemies.push({ kind: kind ?? pick(KINDS), tier, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: TIER_R[tier] * u, spin: rand(-0.8, 0.8), angle: rand(0, Math.PI * 2), phase: rand(0, 10), hp: 1, flash: 0 });
  }

  private spawnRecruiter() {
    const u = this.unit, dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const y = rand(this.h * 0.18, this.h * 0.82);
    this.recruiters.push({ x: dir === 1 ? -50 * u : this.w + 50 * u, y, vx: dir * rand(52, 70) * u, vy: rand(-12, 12) * u, r: 30 * u, phase: rand(0, 10), dir });
  }

  private burst(x: number, y: number, colors: string[], n: number, speed: number, shape: Particle["shape"]) {
    const count = this.opts.calm ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), s = rand(speed * 0.35, speed) * this.unit;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rand(0.45, 0.95), size: rand(3, 7) * this.unit, color: pick(colors), spin: rand(-8, 8), angle: rand(0, 6), shape });
    }
  }

  private float(x: number, y: number, text: string, color: string, big = false) { this.floaters.push({ x, y, text, life: 0, color, big }); }

  private loop(now: number) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    if (this.state === "playing") this.update(dt);
    else if (this.state === "over") this.updateFx(dt);
    if (this.state !== "paused") this.time += dt;
    this.draw();
  }

  private update(dt: number) {
    const u = this.unit, s = this.ship;
    this.runTime += dt;
    this.quipIn -= dt;
    // ---- ship ----
    if (s.alive) {
      const d = this.dir();
      s.moving = Math.hypot(d.x, d.y) > 0.1;
      const accel = 900 * u, max = 300 * u, drag = s.moving ? 2.2 : 3.6;
      s.vx += d.x * accel * dt; s.vy += d.y * accel * dt;
      s.vx -= s.vx * drag * dt; s.vy -= s.vy * drag * dt;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > max) { s.vx *= max / sp; s.vy *= max / sp; }
      s.x = clamp(s.x + s.vx * dt, 20 * u, this.w - 20 * u); s.y = clamp(s.y + s.vy * dt, 20 * u, this.h - 20 * u);
      // The nose turns toward where you're flying, so you aim by moving.
      if (s.moving) s.angle = angleTo(s.angle, Math.atan2(d.y, d.x) + Math.PI / 2, 10 * dt);
      s.cool -= dt; s.invuln = Math.max(0, s.invuln - dt);
      if ((this.keys.has(" ") || this.touchFire) && s.cool <= 0) this.fire();
    }
    // ---- bullets ----
    for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
    this.bullets = this.bullets.filter((b) => b.life > 0 && b.x > -20 && b.x < this.w + 20 && b.y > -20 && b.y < this.h + 20);
    // ---- enemies: they keep closing in ----
    const mul = this.speedMul();
    for (const e of this.enemies) {
      const a = Math.atan2(s.y - e.y, s.x - e.x);
      const steer = (e.tier === 1 ? 70 : e.tier === 2 ? 46 : 30) * u * mul;
      e.vx += Math.cos(a) * steer * dt; e.vy += Math.sin(a) * steer * dt;
      const cap = (e.tier === 3 ? 60 : e.tier === 2 ? 92 : 125) * u * mul;
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > cap) { e.vx *= cap / sp; e.vy *= cap / sp; }
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.angle += e.spin * dt; e.phase += dt; e.flash = Math.max(0, e.flash - dt);
    }
    // ---- hits ----
    for (const b of this.bullets) {
      for (const e of this.enemies) {
        if (e.hp <= 0 || Math.hypot(b.x - e.x, b.y - e.y) > e.r + 5 * u) continue;
        b.life = 0; e.hp = 0;
        this.xp += TIER_XP[e.tier];
        this.burst(e.x, e.y, [C.red, C.plum, C.cream], e.tier * 6, 160, "shard");
        this.shake = Math.max(this.shake, e.tier * 1.5);
        // Shot apart: two smaller pieces, still coming for you.
        if (e.tier > 1) for (let i = 0; i < 2; i++) {
          const t = (e.tier - 1) as 1 | 2;
          this.spawnEnemy(t, { x: e.x + rand(-6, 6), y: e.y + rand(-6, 6) }, e.kind);
          const n = this.enemies[this.enemies.length - 1]!;
          const a = Math.atan2(b.vy, b.vx) + (i ? 1 : -1) * rand(0.6, 1.1);
          const sp = rand(80, 120) * u * mul;
          n.vx = Math.cos(a) * sp; n.vy = Math.sin(a) * sp;
        }
        else {
          this.float(e.x, e.y, `+${TIER_XP[e.tier]}`, C.cream);
          // Now and then a line for the one you just finished off (never more than one every few seconds).
          if (this.quipIn <= 0 && Math.random() < 0.45) { this.float(e.x, e.y - 22 * u, lineFor(ENEMY_INFO[e.kind].pop, this.opts.tone), C.lilac); this.quipIn = 2.6; }
        }
        break;
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.x > -200 && e.x < this.w + 200 && e.y > -200 && e.y < this.h + 200);
    // ---- recruiters: drift across; touch one for an offer ----
    for (const r of this.recruiters) { r.x += r.vx * dt; r.y += r.vy * dt + Math.sin(this.time * 2 + r.phase) * 10 * u * dt; r.phase += dt; }
    for (const r of this.recruiters) {
      if (!s.alive || Math.hypot(r.x - s.x, r.y - s.y) > r.r + 18 * u) continue;
      r.x = -9999;
      this.offers++; this.level++;
      const gain = 100 * this.level;
      this.xp += gain;
      this.burst(s.x, s.y, [C.green, C.amber, C.violet, C.cream], 40, 260, "confetti");
      this.float(s.x, s.y - 64 * u, lineFor(OFFER_LINES, this.opts.tone), C.cream);
      this.float(s.x, s.y - 40 * u, "Offer letter!", C.green, true);
      this.float(s.x, s.y - 14 * u, `+${gain} XP · Level ${this.level}`, C.amber);
      // Every other level, a shout from the top of the screen.
      if (this.level % 2 === 1) this.float(this.w / 2, this.h * 0.2, lineFor(LEVEL_LINES, this.opts.tone), C.amber, true);
      this.quipIn = 3;
      this.opts.onOffer?.(gain, this.level);
    }
    this.recruiters = this.recruiters.filter((r) => r.x > -120 && r.x < this.w + 120);
    // ---- you get hit ----
    if (s.alive && s.invuln <= 0) for (const e of this.enemies) {
      if (Math.hypot(e.x - s.x, e.y - s.y) > e.r + 16 * u) continue;
      s.alive = false; this.killer = e.kind;
      this.burst(s.x, s.y, [C.violet, C.lilac, C.cream, C.amber, C.red], 46, 300, "shard");
      this.shake = 14; this.overDelay = 0.9;
      break;
    }
    // ---- spawning ----
    this.spawnIn -= dt;
    const want = 3 + Math.min(9, this.level + Math.floor(this.runTime / 25));
    if (this.spawnIn <= 0 && this.enemies.length < want * 2) { this.spawnEnemy(3); this.spawnIn = clamp(3.2 - this.level * 0.18, 1.1, 3.2) / (this.opts.calm ? 0.8 : 1); }
    this.recruiterIn -= dt;
    if (this.recruiterIn <= 0 && this.recruiters.length === 0) { this.spawnRecruiter(); this.recruiterIn = rand(7, 11); }
    this.updateFx(dt);
    this.hud();
    if (!s.alive) {
      this.overDelay -= dt;
      if (this.overDelay <= 0) {
        this.setState("over");
        this.overDelay = 0.6; // a beat before Space can restart, so a held key doesn't skip the result
        this.opts.onOver({ xp: this.xp, level: this.level, offers: this.offers, seconds: Math.round(this.runTime), killer: this.killer });
      }
    }
  }

  private updateFx(dt: number) {
    for (const p of this.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.8 * dt; p.vy *= 1 - 1.8 * dt; p.angle += p.spin * dt; }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const f of this.floaters) { f.life += dt; f.y -= 34 * this.unit * dt; }
    this.floaters = this.floaters.filter((f) => f.life < 1.3);
    this.shake = Math.max(0, this.shake - 40 * dt);
    if (this.state === "over") this.overDelay -= dt;
  }

  private fire() {
    const s = this.ship, u = this.unit, a = s.angle - Math.PI / 2, sp = 560 * u;
    const nose = 26 * u;
    this.bullets.push({ x: s.x + Math.cos(a) * nose, y: s.y + Math.sin(a) * nose, vx: Math.cos(a) * sp + s.vx * 0.3, vy: Math.sin(a) * sp + s.vy * 0.3, life: 1.1, angle: s.angle });
    s.cool = 0.19;
  }

  // ---------- drawing ----------

  private draw() {
    const g = this.ctx, u = this.unit;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Night-plum sky with a soft violet floor glow.
    g.fillStyle = C.ink; g.fillRect(0, 0, this.w, this.h);
    const glow = g.createRadialGradient(this.w / 2, this.h * 1.1, 0, this.w / 2, this.h * 1.1, this.h * 0.9);
    glow.addColorStop(0, "rgba(109,40,217,0.28)"); glow.addColorStop(1, "rgba(109,40,217,0)");
    g.fillStyle = glow; g.fillRect(0, 0, this.w, this.h);
    // Stars drift down at three depths (still in calm mode).
    for (const st of this.stars) {
      if (!this.opts.calm && this.state !== "paused") { st.y += st.z * 14 * (1 / 60); if (st.y > this.h) { st.y = 0; st.x = Math.random() * this.w; } }
      const tw = this.opts.calm ? 0.7 : 0.5 + 0.5 * Math.sin(this.time * 2 + st.tw);
      g.globalAlpha = 0.25 + st.z * 0.55 * tw;
      g.fillStyle = st.z === 1 ? C.cream : C.lilac;
      const sz = st.z === 1 ? 2.2 : st.z === 0.6 ? 1.6 : 1.1;
      g.fillRect(st.x, st.y, sz, sz);
    }
    g.globalAlpha = 1;

    g.save();
    if (this.shake > 0 && !this.opts.calm) g.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);

    for (const r of this.recruiters) this.drawRecruiter(r);
    for (const e of this.enemies) this.drawEnemy(e);
    for (const b of this.bullets) this.drawBullet(b);
    if (this.ship.alive && (this.state !== "ready")) this.drawShip();
    if (this.state === "ready") this.drawAttract();
    for (const p of this.particles) this.drawParticle(p);
    for (const f of this.floaters) {
      const a = 1 - f.life / 1.3;
      g.globalAlpha = a;
      g.font = `800 ${Math.round((f.big ? 22 : 15) * u)}px "Space Grotesk", system-ui, sans-serif`;
      g.textAlign = "center"; g.lineJoin = "round"; g.lineWidth = 5 * u; g.strokeStyle = C.ink;
      g.strokeText(f.text, f.x, f.y); g.fillStyle = f.color; g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
    g.restore();
  }

  // The title screen: the ship idles in the middle with its flames pulsing.
  private drawAttract() {
    const s = this.ship;
    s.x = this.w / 2; s.y = this.h * 0.56; s.angle = Math.sin(this.time * 1.2) * 0.12; s.moving = true;
    this.drawShip();
  }

  private frame(ms: number) { return this.opts.calm ? 0 : Math.floor((this.time * 1000) / ms) % 2; }

  private drawShip() {
    const g = this.ctx, s = this.ship, u = this.unit;
    const size = 74 * u, px = size * this.dpr;
    g.save();
    g.translate(s.x, s.y);
    g.rotate(s.angle);
    // Brief blink while you're safe at the start of a run.
    if (s.invuln > 0 && Math.floor(this.time * 10) % 2 === 0) g.globalAlpha = 0.45;
    // Flames on both side thrusters, alternating big and small every 140 ms while you move.
    // Each frame's root (top centre of the flame art, ~22% down) sits on the nozzle.
    const big = s.moving && this.frame(140) === 0;
    const flameName: ImageName = s.moving ? (big ? "flame" : "flameSmall") : "flameSmall";
    const fSize = size * (s.moving ? 0.62 : 0.42);
    const flame = sprite(flameName, fSize * this.dpr);
    const rootY = flameName === "flame" ? 0.223 : 0.233;
    for (const nx of [-0.153, 0.15]) {
      const x = nx * size, y = 0.262 * size;
      if (flame) g.drawImage(flame, x - fSize / 2, y - rootY * fSize, fSize, fSize);
      else { g.fillStyle = C.amber; g.beginPath(); g.ellipse(x, y + fSize * 0.15, fSize * 0.08, fSize * 0.2, 0, 0, Math.PI * 2); g.fill(); }
    }
    const img = sprite("ship", px);
    if (img) g.drawImage(img, -size / 2, -size / 2, size, size);
    else { g.fillStyle = C.violet; g.strokeStyle = C.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -size * 0.35); g.lineTo(size * 0.25, size * 0.3); g.lineTo(-size * 0.25, size * 0.3); g.closePath(); g.fill(); g.stroke(); }
    g.restore();
  }

  private drawBullet(b: Bullet) {
    const g = this.ctx, size = 30 * this.unit;
    const img = sprite("resume", size * this.dpr);
    g.save(); g.translate(b.x, b.y); g.rotate(b.angle);
    if (img) g.drawImage(img, -size / 2, -size / 2, size, size);
    else { g.fillStyle = C.cream; g.fillRect(-3, -6, 6, 12); }
    g.restore();
  }

  private drawRecruiter(r: Recruiter) {
    const g = this.ctx, size = r.r * 3.4;
    const img = sprite(this.frame(300) ? "recruiter2" : "recruiter1", size * this.dpr);
    g.save(); g.translate(r.x, r.y);
    if (r.dir === -1) g.scale(-1, 1);
    // A soft green halo so you can spot the good ones in a crowd.
    g.globalAlpha = 0.18 + (this.opts.calm ? 0 : 0.08 * Math.sin(this.time * 4));
    g.fillStyle = C.green; g.beginPath(); g.arc(0, 0, r.r * 1.35, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    if (img) g.drawImage(img, -size / 2, -size / 2, size, size);
    g.restore();
  }

  private drawParticle(p: Particle) {
    const g = this.ctx, a = 1 - p.life / p.max;
    g.globalAlpha = a; g.fillStyle = p.color;
    if (p.shape === "dot") { g.beginPath(); g.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); g.fill(); }
    else { g.save(); g.translate(p.x, p.y); g.rotate(p.angle); g.strokeStyle = C.ink; g.lineWidth = 1.5;
      if (p.shape === "confetti") { g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); g.strokeRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      else { g.beginPath(); g.moveTo(0, -p.size); g.lineTo(p.size * 0.7, p.size * 0.6); g.lineTo(-p.size * 0.7, p.size * 0.6); g.closePath(); g.fill(); g.stroke(); }
      g.restore(); }
    g.globalAlpha = 1;
  }

  // ---------- the bad practices ----------

  private drawEnemy(e: Enemy) {
    const g = this.ctx, r = e.r;
    g.save(); g.translate(e.x, e.y);
    if (e.kind === "ghoster") {
      const size = r * 3.1;
      const img = sprite(this.frame(350) ? "ghoster2" : "ghoster1", size * this.dpr);
      g.rotate(Math.sin(e.phase * 1.5) * 0.12);
      if (img) g.drawImage(img, -size / 2, -size / 2, size, size); else this.blob(r, C.red);
    } else if (e.kind === "rounds") this.drawRounds(r, e);
    else if (e.kind === "phantom") this.drawPhantom(r, e);
    else if (e.kind === "lowball") this.drawLowball(r, e);
    else this.drawTakeHome(r, e);
    g.restore();
  }

  // Shared look: a hard offset shadow in ink, then a flat fill with a thick ink outline.
  private outlined(path: () => void, fill: string, r: number) {
    const g = this.ctx, o = Math.max(2, r * 0.12), lw = Math.max(2, r * 0.13);
    g.save(); g.translate(o, o); path(); g.fillStyle = C.ink; g.fill(); g.restore();
    path(); g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = C.ink; g.lineJoin = "round"; g.stroke();
  }
  private blob(r: number, fill: string) { this.outlined(() => { this.ctx.beginPath(); this.ctx.arc(0, 0, r, 0, Math.PI * 2); }, fill, r); }
  private eyes(r: number, y: number, angry: boolean) {
    const g = this.ctx, ex = r * 0.32, er = r * 0.17;
    for (const s of [-1, 1]) {
      g.beginPath(); g.arc(s * ex, y, er, 0, Math.PI * 2); g.fillStyle = C.cream; g.fill(); g.lineWidth = Math.max(1.5, r * 0.07); g.strokeStyle = C.ink; g.stroke();
      g.beginPath(); g.arc(s * ex + er * 0.25, y + er * 0.15, er * 0.5, 0, Math.PI * 2); g.fillStyle = C.ink; g.fill();
      if (angry) { g.beginPath(); g.moveTo(s * (ex + er * 1.1), y - er * 1.5); g.lineTo(s * (ex - er * 1.1), y - er * 0.8); g.lineWidth = Math.max(2, r * 0.09); g.stroke(); }
    }
  }

  // Endless Rounds: a clock that never stops, ringed by a looping arrow.
  private drawRounds(r: number, e: Enemy) {
    const g = this.ctx;
    this.blob(r, C.cream);
    g.save(); g.rotate(e.phase * (this.opts.calm ? 0.4 : 1.6));
    g.beginPath(); g.arc(0, 0, r * 0.82, -Math.PI * 0.15, Math.PI * 1.55); g.lineWidth = Math.max(2.5, r * 0.16); g.strokeStyle = C.violet; g.lineCap = "round"; g.stroke();
    const ax = Math.cos(Math.PI * 1.55) * r * 0.82, ay = Math.sin(Math.PI * 1.55) * r * 0.82;
    g.beginPath(); g.moveTo(ax + r * 0.22, ay - r * 0.02); g.lineTo(ax, ay + r * 0.2); g.lineTo(ax - r * 0.18, ay - r * 0.1); g.closePath(); g.fillStyle = C.violet; g.fill();
    g.restore();
    this.eyes(r * 0.85, -r * 0.18, true);
    g.beginPath(); g.moveTo(-r * 0.2, r * 0.35); g.quadraticCurveTo(0, r * 0.2, r * 0.2, r * 0.35); g.lineWidth = Math.max(2, r * 0.08); g.strokeStyle = C.ink; g.stroke();
  }

  // Phantom Posting: a job ad that was never real, flickering in and out.
  private drawPhantom(r: number, e: Enemy) {
    const g = this.ctx, w = r * 1.5, h = r * 1.8;
    g.globalAlpha = this.opts.calm ? 0.85 : 0.45 + 0.5 * (0.5 + 0.5 * Math.sin(e.phase * 3));
    g.rotate(Math.sin(e.phase) * 0.15);
    this.outlined(() => { g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, r * 0.2); }, C.cream, r);
    g.fillStyle = C.lilac; g.fillRect(-w * 0.32, -h * 0.34, w * 0.64, h * 0.1);
    g.fillStyle = "rgba(22,17,29,0.35)"; for (let i = 0; i < 2; i++) g.fillRect(-w * 0.32, h * (0.18 + i * 0.13), w * (0.64 - i * 0.2), h * 0.06);
    this.eyes(r * 0.75, -h * 0.05, false);
    g.globalAlpha = 1;
  }

  // Lowball: a smug coin worth far less than the posting said.
  private drawLowball(r: number, e: Enemy) {
    const g = this.ctx;
    g.scale(0.75 + 0.25 * Math.abs(Math.cos(e.phase * (this.opts.calm ? 0.5 : 2))), 1);
    this.blob(r, C.amber);
    g.beginPath(); g.arc(0, 0, r * 0.74, 0, Math.PI * 2); g.lineWidth = Math.max(1.5, r * 0.07); g.strokeStyle = "rgba(22,17,29,0.55)"; g.stroke();
    g.fillStyle = C.ink; g.font = `900 ${Math.round(r * 0.8)}px "Space Grotesk", system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("₹", 0, r * 0.12);
    // Half-lidded smug eyes above the symbol.
    g.lineWidth = Math.max(2, r * 0.09); g.strokeStyle = C.ink; g.lineCap = "round";
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.45, -r * 0.42); g.lineTo(s * r * 0.15, -r * 0.4); g.stroke(); }
  }

  // Take-Home Monster: a laptop with teeth, hungry for your weekend.
  private drawTakeHome(r: number, e: Enemy) {
    const g = this.ctx, w = r * 1.9, h = r * 1.3;
    const chomp = this.opts.calm ? 0.1 : 0.12 + 0.12 * Math.abs(Math.sin(e.phase * 5));
    this.outlined(() => { g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, r * 0.18); }, C.violet, r);
    g.fillStyle = C.ink; g.fillRect(-w * 0.4, -h * 0.36, w * 0.8, h * 0.5);
    this.eyes(r * 0.7, -h * 0.14, true);
    // The mouth opens and shuts.
    const my = h * 0.24, mh = h * chomp;
    g.fillStyle = C.red; g.fillRect(-w * 0.36, my - mh / 2, w * 0.72, mh);
    g.fillStyle = C.cream;
    for (let i = 0; i < 5; i++) { const x = -w * 0.36 + (i + 0.5) * (w * 0.72 / 5); g.beginPath(); g.moveTo(x - w * 0.05, my - mh / 2); g.lineTo(x + w * 0.05, my - mh / 2); g.lineTo(x, my - mh / 2 + mh * 0.6); g.closePath(); g.fill(); }
    g.lineWidth = Math.max(2, r * 0.1); g.strokeStyle = C.ink; g.strokeRect(-w * 0.36, my - mh / 2, w * 0.72, mh);
    // Keyboard base.
    this.outlined(() => { g.beginPath(); g.roundRect(-w * 0.62, h * 0.48, w * 1.24, h * 0.18, r * 0.08); }, C.lilac, r * 0.6);
  }
}

// Names and lines, kept with the game so the two never drift apart. `line` is the classic end-screen
// line; `outro` adds variety on the end screen; `pop` is what pops up when you finish one off.
type Lines = { sassy: string[]; calm: string[] };
export const ENEMY_INFO: Record<EnemyKind, { name: string; line: { sassy: string; calm: string }; outro: Lines; pop: Lines }> = {
  ghoster: {
    name: "The Ghoster", line: { sassy: "Seen at 10:02. Replied never.", calm: "They stopped replying." },
    outro: { sassy: ["They'll “circle back”. They won't.", "Left on read, permanently.", "Your follow-up email is now a ghost too."], calm: ["The replies stopped.", "No response this time."] },
    pop: { sassy: ["Ghosted the ghoster", "Read receipts: off", "Boo yourself", "Who's silent now?"], calm: ["Cleared", "Reply received"] },
  },
  rounds: {
    name: "Endless Rounds", line: { sassy: "Round seven, with the founder's cousin.", calm: "One round too many." },
    outro: { sassy: ["Just one more quick round. Forever.", "The final round had a final round.", "You met the whole company. Twice."], calm: ["The process ran long.", "Too many rounds this time."] },
    pop: { sassy: ["Round skipped", "No round eight", "Panel dismissed", "Loop broken"], calm: ["Cleared", "One less round"] },
  },
  phantom: {
    name: "Phantom Posting", line: { sassy: "The job was never real. Your effort was.", calm: "The role never existed." },
    outro: { sassy: ["Reposted daily. Hired never.", "The headcount was a mood.", "Applied to a vibe. Got haunted."], calm: ["That posting wasn't real.", "The role was never open."] },
    pop: { sassy: ["Posting removed", "Not even real", "Fake job, real hit", "Unlisted"], calm: ["Cleared", "Gone"] },
  },
  lowball: {
    name: "Lowball", line: { sassy: "The range was a vibe. Here's 30% less.", calm: "The offer came in far below the posting." },
    outro: { sassy: ["“Competitive pay”, competing with nothing.", "They paid you in exposure.", "Your current CTC became your ceiling."], calm: ["The pay didn't match the posting.", "The offer was too low."] },
    pop: { sassy: ["Counter-offered", "Negotiated", "Pay me properly", "Range restored"], calm: ["Cleared", "Fair pay"] },
  },
  takehome: {
    name: "Take-Home Monster", line: { sassy: "It ate your weekend and asked for more.", calm: "The assignment took far longer than promised." },
    outro: { sassy: ["“Max 2 hours.” It's Tuesday now.", "Your assignment shipped to their prod.", "Unpaid labour, beautifully formatted."], calm: ["The assignment was too long.", "That task took the whole weekend."] },
    pop: { sassy: ["Weekend saved", "Not doing that", "Free work: denied", "Scope rejected"], calm: ["Cleared", "Task declined"] },
  },
};

// Green Flag Recruiter lines when you collect an offer, and level-up shouts.
export const OFFER_LINES: Lines = {
  sassy: ["They replied in a day!", "Feedback included. Wild.", "Salary in writing. Who are they?", "No sixth round. A miracle.", "They remembered your name!", "Offer letter, no strings"],
  calm: ["Offer received", "A clear, quick reply", "Fair and on time"],
};
export const LEVEL_LINES: Lines = {
  sassy: ["Promoted! (In a game. Still counts.)", "Experience: undeniable", "Recruiters are noticing", "Senior ghost blaster", "Hiring managers hate this trick"],
  calm: ["Level up", "Nice progress", "Moving up"],
};
// Rotating lines under the title screen.
export const TITLE_LINES: Lines = {
  sassy: ["Your résumé is finally useful.", "No take-home. Just take-downs.", "Shoot first. Follow up later.", "The only process with instant feedback.", "Ghosting goes both ways now."],
  calm: ["Collect offers, avoid bad practices.", "A short break while you wait.", "Beat your best Experience."],
};

export const lineFor = (l: Lines, tone: "sassy" | "calm") => { const a = l[tone]; return a[Math.floor(Math.random() * a.length)]!; };
