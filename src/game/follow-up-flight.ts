// Follow-Up Flight: your follow-up email is a paper plane. Tap / click / Space to flap it up through
// the gaps in walls of "No reply", "Auto-reply" and "Silence". Each wall passed is a point; now and
// then a reply envelope floats in a gap for a bonus. Touch a wall, the ceiling or the floor and the
// follow-up is lost. The walls come faster as you go.
import { Arcade, C, envelope, inked, nightSky, roundRect, sprite } from "./arcade";

type Wall = { x: number; gapY: number; gap: number; label: string; passed: boolean; bonus: boolean };
const LABELS = ["No reply", "Auto-reply", "Silence", "Seen", "On hold", "We'll get back", "Under review", "Spam folder"];
const WALL_W = 74;

export class FollowUpFlight extends Arcade {
  private y = 0; private vy = 0; private score = 0; private walls: Wall[] = []; private nextIn = 0; private started = false;
  private ghosts: { x: number; y: number; s: number; v: number }[] = [];

  protected reset() {
    this.y = this.h * 0.45; this.vy = 0; this.score = 0; this.walls = []; this.nextIn = 0.4; this.started = false;
    this.ghosts = Array.from({ length: 4 }, (_, i) => ({ x: (i + 0.5) * (this.w / 4), y: 40 + Math.random() * (this.h - 140), s: 30 + Math.random() * 24, v: 14 + Math.random() * 20 }));
    this.opts.onHud({ score: 0 });
  }
  private planeX() { return Math.max(70, this.w * 0.26); }
  // A flap is a short, controlled hop (about a twelfth of the screen), so steady tapping holds height.
  protected override press() { this.started = true; this.vy = -Math.max(330, this.h * 0.62); }

  protected update(dt: number) {
    const gravity = Math.max(1100, this.h * 2.1);
    if (!this.started) { this.y = this.h * 0.45 + Math.sin(this.t * 3) * 10; return; } // hover until the first flap
    this.vy = Math.min(this.vy + gravity * dt, 900); this.y += this.vy * dt;
    const speed = Math.min(400, 210 + this.score * 5);
    this.nextIn -= dt;
    if (this.nextIn <= 0) {
      const gap = Math.max(130, Math.min(220, this.h * 0.34) - this.score * 1.5);
      const gapY = 70 + gap / 2 + Math.random() * Math.max(10, this.h - 140 - gap - 26);
      this.walls.push({ x: this.w + WALL_W, gapY, gap, label: LABELS[Math.floor(Math.random() * LABELS.length)]!, passed: false, bonus: Math.random() < 0.22 });
      this.nextIn = Math.max(1.05, 1.7 - this.score * 0.02);
    }
    const px = this.planeX(), r = 15;
    for (const w of this.walls) {
      w.x -= speed * dt;
      if (!w.passed && w.x + WALL_W / 2 < px) { w.passed = true; this.score += 1; this.opts.onHud({ score: this.score }); }
      if (w.bonus && Math.abs(w.x - px) < 24 && Math.abs(w.gapY - this.y) < 26) { w.bonus = false; this.score += 3; this.burst(px, this.y, C.green); this.float(px, this.y - 26, "Reply! +3", C.green); this.opts.onHud({ score: this.score }); }
      const inX = px + r > w.x - WALL_W / 2 && px - r < w.x + WALL_W / 2;
      if (inX && (this.y - r < w.gapY - w.gap / 2 || this.y + r > w.gapY + w.gap / 2)) { this.burst(px, this.y, C.cream, 20); this.gameOver(this.score, `${this.score} walls cleared`); return; }
    }
    this.walls = this.walls.filter((w) => w.x > -WALL_W);
    if (this.y < 6 || this.y > this.h - 30) { this.burst(px, this.y, C.cream, 20); this.gameOver(this.score, `${this.score} walls cleared`); }
    for (const gh of this.ghosts) { gh.x -= gh.v * dt; if (gh.x < -60) { gh.x = this.w + 60; gh.y = 40 + Math.random() * (this.h - 140); } }
  }

  protected draw(g: CanvasRenderingContext2D) {
    nightSky(g, this.w, this.h, this.t, this.opts.calm);
    // drifting Ghosters far behind, faint
    g.globalAlpha = 0.18;
    for (const gh of this.ghosts) { const img = sprite("ghoster1", gh.s); if (img) g.drawImage(img, gh.x - gh.s / 2, gh.y - gh.s / 2); }
    g.globalAlpha = 1;

    for (const w of this.walls) {
      const top = w.gapY - w.gap / 2, bot = w.gapY + w.gap / 2, x = w.x - WALL_W / 2;
      roundRect(g, x, -10, WALL_W, top + 10, 10); inked(g, C.violet, 4);
      roundRect(g, x, bot, WALL_W, this.h - bot + 10, 10); inked(g, C.violet, 4);
      // caps with the label, the way the walls read in an inbox
      roundRect(g, x - 6, top - 26, WALL_W + 12, 26, 8); inked(g, C.cream, 3);
      roundRect(g, x - 6, bot, WALL_W + 12, 26, 8); inked(g, C.cream, 3);
      g.fillStyle = C.ink; g.font = "700 10px Inter, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(w.label, w.x, top - 13); g.fillText(w.label, w.x, bot + 13);
      if (w.bonus) envelope(g, w.x, w.gapY, 30, C.cream, C.green);
    }

    // the floor
    g.fillStyle = C.ink; g.fillRect(-20, this.h - 24, this.w + 40, 40);
    g.fillStyle = C.violet; g.fillRect(-20, this.h - 24, this.w + 40, 4);

    // the paper plane, tilted by its speed
    const px = this.planeX(), tilt = Math.max(-0.5, Math.min(0.9, this.vy / 900));
    g.save(); g.translate(px, this.y); g.rotate(tilt);
    g.beginPath(); g.moveTo(24, 0); g.lineTo(-20, -15); g.lineTo(-10, 0); g.lineTo(-20, 15); g.closePath(); inked(g, C.white, 3);
    g.beginPath(); g.moveTo(24, 0); g.lineTo(-10, 0); g.lineWidth = 2.5; g.strokeStyle = C.ink; g.stroke();
    g.restore();
    if (!this.started && this.state === "playing") {
      g.font = "700 16px 'Space Grotesk', sans-serif"; g.textAlign = "center"; g.fillStyle = C.cream; g.fillText("Tap or press Space to fly", this.w / 2, this.h * 0.7);
    }
  }
}
