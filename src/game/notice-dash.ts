// Notice Period Dash: the Ghosted ghost runs through the city during its notice period. Jump
// (tap / Space / Up, press again in the air for a double jump) over take-home tasks and endless
// interview rounds; duck (hold Down, or swipe down on a phone) under flying Ghosters. Collect offer
// letters on the way. The run speeds up; one hit ends it. Score is distance plus offers.
import { Arcade, C, envelope, inked, nightSky, roundRect, sprite } from "./arcade";

type Obstacle = { kind: "takehome" | "rounds" | "ghoster"; x: number; w: number; h: number; label: string };
type Coin = { x: number; y: number; got: boolean };
const SIZE = 64;

export class NoticeDash extends Arcade {
  private y = 0; private vy = 0; private jumps = 0; private ducking = false; private speed = 0; private dist = 0; private offers = 0;
  private obs: Obstacle[] = []; private coins: Coin[] = []; private nextIn = 0; private swipeY: number | null = null;
  private sinceSpawn = 9; private lastKind: Obstacle["kind"] = "takehome";

  private ground() { return this.h - 60; }
  private runnerX() { return Math.max(56, this.w * 0.18); }
  private score() { return Math.floor(this.dist / 10) + this.offers * 25; }
  protected reset() { this.y = this.ground(); this.vy = 0; this.jumps = 0; this.ducking = false; this.speed = 320; this.dist = 0; this.offers = 0; this.obs = []; this.coins = []; this.nextIn = 1.1; this.sinceSpawn = 9; this.lastKind = "takehome"; this.opts.onHud({ score: 0 }); }
  protected override press() {
    if (this.jumps < 2) { this.vy = this.jumps === 0 ? -Math.max(640, this.h * 1.35) : -Math.max(520, this.h * 1.1); this.jumps += 1; this.ducking = false; }
    this.swipeY = this.pointer?.y ?? null;
  }
  protected override release() { this.swipeY = null; if (this.pointer) this.ducking = false; }
  protected override duck(on: boolean) { this.ducking = on && this.y >= this.ground() - 1; if (on && this.y < this.ground() - 1) this.vy = Math.max(this.vy, 700); }

  protected update(dt: number) {
    // swipe down on a phone to duck
    if (this.swipeY != null && this.pointer?.down && this.pointer.y - this.swipeY > 40) { this.duck(true); this.swipeY = null; }
    this.speed = Math.min(760, 320 + this.t * 9);
    this.dist += this.speed * dt;
    const g = Math.max(1900, this.h * 4);
    this.vy += g * dt; this.y += this.vy * dt;
    if (this.y >= this.ground()) { this.y = this.ground(); this.vy = 0; this.jumps = 0; }

    this.nextIn -= dt; this.sinceSpawn += dt;
    if (this.nextIn <= 0) {
      const r = Math.random(), x = this.w + 60;
      // Fair play: a Ghoster (duck) never follows a jump obstacle so closely that you'd still be in
      // the air when it arrives, since you can't duck mid-jump. Too close, and it's a box instead.
      const air = (2 * Math.max(640, this.h * 1.35)) / Math.max(1900, this.h * 4) + 0.35;
      const ghosterOk = this.lastKind === "ghoster" || this.sinceSpawn > air;
      if (r < 0.42 || (r >= 0.74 && !ghosterOk)) this.obs.push({ kind: "takehome", x, w: 74, h: 48, label: "Take-home" });
      else if (r < 0.74) this.obs.push({ kind: "rounds", x, w: 50, h: 86, label: `Round ${4 + Math.floor(Math.random() * 6)}` });
      else this.obs.push({ kind: "ghoster", x, w: 52, h: 52, label: "" });
      this.lastKind = this.obs[this.obs.length - 1]!.kind; this.sinceSpawn = 0;
      // a little arc of offer letters now and then
      if (Math.random() < 0.55) { const cy = this.ground() - 110 - Math.random() * 60; for (let i = 0; i < 4; i++) this.coins.push({ x: x + 160 + i * 42, y: cy - Math.sin((i / 3) * Math.PI) * 40, got: false }); }
      this.nextIn = Math.max(0.62, (1.45 - this.t * 0.006)) * (0.8 + Math.random() * 0.5);
    }
    const rx = this.runnerX(), half = SIZE * 0.32;
    const top = this.ducking ? this.y - SIZE * 0.45 : this.y - SIZE * 0.85, bottom = this.y - 4;
    for (const o of this.obs) {
      o.x -= this.speed * dt;
      const oy = o.kind === "ghoster" ? this.ground() - 92 : this.ground() - o.h; // Ghosters fly at head height: duck
      if (rx + half > o.x - o.w / 2 + 6 && rx - half < o.x + o.w / 2 - 6 && bottom > oy + 6 && top < oy + o.h - 6) {
        this.burst(rx, this.y - SIZE / 2, C.red, 20);
        this.gameOver(this.score(), `${Math.floor(this.dist / 10)} m run, ${this.offers} ${this.offers === 1 ? "offer" : "offers"}`); return;
      }
    }
    for (const c of this.coins) {
      c.x -= this.speed * dt;
      if (!c.got && Math.abs(c.x - rx) < 30 && c.y > top - 14 && c.y < bottom + 14) { c.got = true; this.offers += 1; this.burst(c.x, c.y, C.green, 8); this.float(c.x, c.y - 20, "+25", C.green); }
    }
    this.obs = this.obs.filter((o) => o.x > -100); this.coins = this.coins.filter((c) => c.x > -40 && !c.got);
    this.opts.onHud({ score: this.score() });
  }

  protected draw(g: CanvasRenderingContext2D) {
    nightSky(g, this.w, this.h, this.t, this.opts.calm);
    // city skyline, two parallax layers of office blocks with lit windows
    const gy = this.ground();
    for (const [layer, col, speedK, hk] of [[0, "#241532", 0.15, 0.45], [1, "#33204A", 0.35, 0.3]] as const) {
      const off = (this.dist * speedK) % 160;
      for (let i = -1; i < this.w / 80 + 2; i++) {
        const bw = 70 + ((i * 37 + layer * 11) % 40), bh = this.h * hk * (0.5 + ((i * 53 + layer * 7) % 50) / 100);
        const x = i * 80 - off; g.fillStyle = col; g.fillRect(x, gy - bh, bw, bh);
        g.fillStyle = "rgba(245,158,11,0.35)";
        for (let wy = gy - bh + 12; wy < gy - 12; wy += 18) for (let wx = x + 10; wx < x + bw - 10; wx += 16) if (((wx * 7 + wy * 3) | 0) % 5 === 0) g.fillRect(wx, wy, 6, 8);
      }
    }
    // the road
    g.fillStyle = C.ink; g.fillRect(-20, gy, this.w + 40, this.h - gy + 20);
    g.fillStyle = C.violet; g.fillRect(-20, gy, this.w + 40, 4);
    g.fillStyle = "rgba(242,233,216,0.25)"; const dash = this.dist % 60; for (let x = -dash; x < this.w; x += 60) g.fillRect(x, gy + 24, 30, 4);

    for (const c of this.coins) envelope(g, c.x, c.y, 26);
    for (const o of this.obs) {
      if (o.kind === "ghoster") { const img = sprite(Math.floor(this.t * 5) % 2 ? "ghoster2" : "ghoster1", 56); if (img) g.drawImage(img, o.x - 28, gy - 92 - 2 + (this.opts.calm ? 0 : Math.sin(this.t * 6) * 4)); continue; }
      const y = gy - o.h;
      roundRect(g, o.x - o.w / 2, y, o.w, o.h, 8); inked(g, o.kind === "takehome" ? C.amber : C.lilac, 4);
      g.fillStyle = C.ink; g.font = "700 10px Inter, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(o.label, o.x, y + o.h / 2);
    }

    // the runner: the Ghosted ghost, bobbing while it runs, squashed while ducking
    const rx = this.runnerX(), img = sprite("mark", SIZE);
    const bob = this.y >= gy && !this.opts.calm ? Math.abs(Math.sin(this.t * 14)) * 4 : 0;
    g.save(); g.translate(rx, this.y - bob);
    if (this.ducking) g.scale(1.15, 0.6);
    if (img) g.drawImage(img, -SIZE / 2, -SIZE); else { g.beginPath(); g.arc(0, -SIZE / 2, SIZE / 2.4, 0, Math.PI * 2); inked(g, C.lilac, 4); }
    g.restore();
  }
}
