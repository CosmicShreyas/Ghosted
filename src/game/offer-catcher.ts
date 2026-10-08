// Offer Catcher: move your inbox tray along the bottom. Catch offer letters (and the rare Green Flag
// Recruiter, worth more); dodge red flags and Ghosters, which cost a life. Catches in a row build a
// combo multiplier; a miss resets it. Things fall faster as the run goes on. Three lives.
import { Arcade, C, envelope, inked, nightSky, redFlag, roundRect, sprite } from "./arcade";

type Kind = "offer" | "recruiter" | "flag" | "ghoster";
type Drop = { kind: Kind; x: number; y: number; vy: number; spin: number; size: number };

export class OfferCatcher extends Arcade {
  private trayX = 0; private lives = 3; private score = 0; private combo = 0; private drops: Drop[] = [];
  private spawnIn = 0; private hurtT = 0; private catches = 0;

  protected reset() { this.trayX = this.w / 2; this.lives = 3; this.score = 0; this.combo = 0; this.drops = []; this.spawnIn = 0.6; this.hurtT = 0; this.catches = 0; this.hud(); }
  private hud() { this.opts.onHud({ score: this.score, lives: this.lives, combo: this.combo }); }
  private trayW() { return Math.min(150, Math.max(92, this.w * 0.24)); }
  private trayY() { return this.h - 54; }

  protected update(dt: number) {
    // Steering: follow the finger or mouse; arrows / A D also work.
    const speed = 760, half = this.trayW() / 2;
    if (this.pointer) this.trayX += (this.pointer.x - this.trayX) * Math.min(1, dt * 16);
    if (this.keys.has("arrowleft") || this.keys.has("a")) this.trayX -= speed * dt;
    if (this.keys.has("arrowright") || this.keys.has("d")) this.trayX += speed * dt;
    this.trayX = Math.max(half, Math.min(this.w - half, this.trayX));

    // Spawning ramps up over about two minutes.
    const ramp = Math.min(1, this.t / 120);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = 0.85 - ramp * 0.5 + Math.random() * 0.25;
      const r = Math.random();
      const kind: Kind = r < 0.06 ? "recruiter" : r < 0.56 ? "offer" : r < 0.8 ? "flag" : "ghoster";
      const size = kind === "recruiter" ? 58 : kind === "ghoster" ? 54 : 42;
      this.drops.push({ kind, size, x: 30 + Math.random() * (this.w - 60), y: -40, vy: (150 + ramp * 260) * (0.85 + Math.random() * 0.35) * (kind === "recruiter" ? 0.8 : 1), spin: (Math.random() - 0.5) * 2 });
    }

    const ty = this.trayY(), tx = this.trayX;
    for (const d of this.drops) d.y += d.vy * dt;
    this.drops = this.drops.filter((d) => {
      const caught = d.y + d.size * 0.35 >= ty - 8 && d.y - d.size * 0.35 <= ty + 14 && Math.abs(d.x - tx) < half + d.size * 0.3;
      if (caught) {
        if (d.kind === "offer" || d.kind === "recruiter") {
          this.combo += 1; this.catches += 1;
          const mult = 1 + Math.floor(this.combo / 5), pts = (d.kind === "recruiter" ? 50 : 10) * mult;
          this.score += pts; this.burst(d.x, ty - 10, d.kind === "recruiter" ? C.green : C.cream);
          this.float(d.x, ty - 30, mult > 1 ? `+${pts} x${mult}` : `+${pts}`, d.kind === "recruiter" ? C.green : C.amber);
        } else {
          this.lives -= 1; this.combo = 0; this.hurtT = 0.5; this.shake(0.3); this.burst(d.x, ty - 10, C.red, 18);
          this.float(d.x, ty - 30, d.kind === "flag" ? "Red flag!" : "Ghosted!", C.red);
          if (this.lives <= 0) { this.hud(); this.gameOver(this.score, `${this.catches} offers caught`); return false; }
        }
        this.hud(); return false;
      }
      if (d.y - d.size > this.h) { if (d.kind === "offer" && this.combo > 0) { this.combo = 0; this.hud(); } return false; }
      return true;
    });
    this.hurtT = Math.max(0, this.hurtT - dt);
  }

  protected draw(g: CanvasRenderingContext2D) {
    nightSky(g, this.w, this.h, this.t, this.opts.calm);
    // the floor
    g.fillStyle = C.ink; g.fillRect(-20, this.h - 26, this.w + 40, 40);
    g.fillStyle = C.violet; g.fillRect(-20, this.h - 26, this.w + 40, 4);

    for (const d of this.drops) {
      const wob = this.opts.calm ? 0 : Math.sin(this.t * 6 + d.x) * 0.15;
      g.save(); g.translate(d.x, d.y); g.rotate(d.spin * 0.3 + wob);
      if (d.kind === "offer") envelope(g, 0, 0, d.size);
      else if (d.kind === "flag") redFlag(g, 0, 0, d.size, Math.sin(this.t * 8 + d.x));
      else { const img = sprite(d.kind === "recruiter" ? (Math.floor(this.t * 4) % 2 ? "recruiter2" : "recruiter1") : (Math.floor(this.t * 4) % 2 ? "ghoster2" : "ghoster1"), d.size); if (img) g.drawImage(img, -d.size / 2, -d.size / 2); }
      g.restore();
    }

    // the tray (your inbox), flashing red when hurt
    const tw = this.trayW(), ty = this.trayY(), tx = this.trayX;
    const hurt = this.hurtT > 0 && Math.floor(this.hurtT * 20) % 2 === 0;
    roundRect(g, tx - tw / 2, ty - 6, tw, 30, 10); inked(g, hurt ? C.red : C.violet, 4);
    roundRect(g, tx - tw / 2 + 10, ty - 14, tw - 20, 12, 5); inked(g, C.cream, 3);
    g.font = "700 13px Inter, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = C.cream; g.fillText("INBOX", tx, ty + 9);
  }
}
