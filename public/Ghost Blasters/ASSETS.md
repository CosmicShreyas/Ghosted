# Ghost Blasters

Optional subtitle: Hiring Process: Haunted.

## Phase 1: player artwork review

Generated using the built-in image generation tool. No gameplay code changed.
Reviewed src/styles.css, src/components/dashboard/ui-kit.ts and public/ghosted-mark.png.
The requested palette matches the site's violet, cream and night-plum direction.
These are review drafts; confirm small-size readability before gameplay integration.
The generator may introduce slight shading despite flat-fill instructions.

Files: player-ship.png, thruster-flame.png, resume-projectile.png.

## Exact generation prompts

### Player ship

Use case: stylized-concept. Asset: player rocketship sprite for Ghost Blasters. Generate 1024x1024 transparent PNG. Flat 2D neo-brutalist cartoon, thick near-black outlines, flat solid colors, one hard offset shadow attached to the silhouette, no gradients, blur, floor shadow, text or watermark. Palette violet #6D28D9, light violet #9F7AEA, cream #F2E9D8, night plum #16111D. Top-down orthographic view, nose straight up, centered with wide transparent margins. Small friendly candidate rocketship with violet body, cream wing tips, round cockpit with a tiny goofy ghost peeking out, small paper-resume emblem on one wing with only abstract strokes. No flame. Ghost has rounded dome, scalloped lower edge, chunky plum outline and slightly unimpressed eyes inspired by Ghosted's mascot, but use flat fills rather than mascot gradients. Crisp simple silhouette readable at 48px. Only one ship.

### Thruster flame

Use case: stylized-concept. Ghost Blasters game sprite. 1024x1024 transparent background, centered with wide margin. Flat 2D neo-brutalist cartoon, thick near-black outlines, solid uniform flat fills, one crisp hard offset silhouette shadow. No gradients, texture, blur, lighting effects, text, watermark or background objects. Top-down game asset. THRUSTER FLAME ONLY: short rocket flame, three nested stacked teardrop shapes with rounded top and pointed bottom: red #EF4444 outer, amber #F59E0B middle, cream #F2E9D8 inner. Points straight down to attach beneath a ship. Single compact flame, no ship, no smoke.

### Resume projectile

Use case: stylized-concept. Ghost Blasters game sprite. 1024x1024 transparent background, centered with wide margin. Flat 2D neo-brutalist cartoon, thick near-black outlines, solid uniform flat fills, one crisp hard offset silhouette shadow. No gradients, texture, blur, lighting effects, text, watermark or background objects. Top-down game asset. PROJECTILE ONLY: one tiny folded paper resume plane, cream #F2E9D8 with thick violet #6D28D9 outline and a single night plum #16111D hard offset edge shadow. Pointed nose faces exactly straight up, symmetric wide folded wings, simple central fold. Single sprite with no flight trail, no letters or writing.

## Remaining phases, each requires approval

- Remaining enemy artwork: Endless Rounds, Phantom Posting, Lowball, Take-Home Monster. Ghoster now has two frames. Targets are bad hiring practices, never people.
- Offer letter pickup, two bursts, seamless background, icon sheet, banners and cover. Friendly recruiter now has two frames.
- Canvas gameplay, Play navigation, saved controls and Experience, touch input and calmer mode.
- Share card and optional server-validated cosmetic leaderboard. SQL only for user execution, never a live migration.

## Manual review

Open the PNGs on light and night-plum backgrounds. Inspect outlines and transparent margins.
Check the ship and projectile point up and the flame points down.
Review ship at 48px and projectile at 16px before approving the remaining artwork.

## Motion asset phase

Created with the built-in image generation tool. Original large flame is unchanged.
These are separate transparent PNG frames, not animated files. Gameplay animation is not wired yet.

| Animation | Frame A | Frame B | Suggested frame duration |
| --- | --- | --- | --- |
| Thruster pulse | thruster-flame.png (large) | thruster-flame-small.png | 140 ms |
| Friendly recruiter waving | green-flag-recruiter-01.png | green-flag-recruiter-02.png | 300 ms |
| Ghoster idle squint and tail ripple | ghoster-01.png | ghoster-02.png | 350 ms |

Use an A-B loop. Freeze on frame A in calmer mode and pause when the tab is hidden.
Keep a shared draw size and body anchor for each character pair. Do not independently auto-fit frames to their opaque bounds, which would cause scale jumps.
The small flame is shorter and narrower. Its generated root is slightly lower than the original, so align the top opaque root to the ship nozzle separately per frame during integration. Do not anchor the flames by their image centers.
Use stable gameplay collision geometry, not the changing flag, tail dots, flame or transparent image rectangle.
Generated art retains some shading; this is not a claim of exact flat palette reproduction.

### Manual motion review

1. Alternate each pair at the suggested timing in the eventual canvas integration and inspect for jitter.
2. Check on cream and night-plum backgrounds at actual gameplay sizes (48-96px characters).
3. Verify the flame root stays attached to the nozzle while the tip pulses.
4. Check calmer mode displays a static frame and hidden tabs stop animation once gameplay is wired.

### Motion generation prompts

#### thruster-flame-small

Edit the reference flame into the SMALL animation frame. Preserve the same transparent 1254x1254 canvas, palette, thick outline and three nested red/amber/cream shapes. Keep flame root top-center at the same canvas position (approximately x627 y280), but shorten the flame to 60 percent of its original length and narrow it to 80 percent width. It still points DOWN. Do not recenter vertically, do not enlarge to fill the canvas. No ship, no text, no additional objects. The large original will alternate with this shorter pulse.

#### green-flag-recruiter-01

Flat 2D neo-brutalist cartoon game sprite for Ghost Blasters. Thick black/plum outlines, flat solid fills, single hard offset shadow, no gradients or blur, no text or watermark. Transparent square canvas 1254x1254, wide margins, centered, readable at small scale. Palette #6D28D9 #9F7AEA #F2E9D8 #16111D #22C55E #F59E0B #EF4444. Friendly Green Flag Recruiter FRAME 1: round cream head, warm big smile, violet headset, green jacket, violet lanyard with blank cream badge, tiny plum jetpack. Floating compact cartoon sprite for top-down arena game, face visible. Hold a bright green flag on the left of image, cream offer envelope with violet seal on right. Flag gently waves left. Eyes open. Sympathetic goofy proportions. No glow, use solid green accents. Full character within central 65 percent of canvas.

#### ghoster-01

Flat 2D neo-brutalist cartoon game sprite for Ghost Blasters. Thick black/plum outlines, flat solid fills, single hard offset shadow, no gradients or blur, no text or watermark. Transparent square canvas 1254x1254, wide margins, centered, readable at small scale. Palette #6D28D9 #9F7AEA #F2E9D8 #16111D #22C55E #F59E0B #EF4444. The Ghoster FRAME 1, personification of ghosting hiring practices, NOT a human recruiter. Sneaky chunky irregular red ghost with plum lower tail, smirking half-lidded eyes, rounded dome. Scalloped tail curls left, three solid separated tail dots trail lower left. Holds a cream speech bubble containing precisely three plum dots, no writing. Cute menacing asteroid-like silhouette for top-down arena game, face visible. Full character within central 65 percent of canvas.

#### green-flag-recruiter-02

Create animation frame 2 by editing this exact recruiter sprite. Preserve canvas size, transparent background, body and head location, scale, identity, outfit, palette, outline thickness and all accessories. Change only the green flag fabric to the opposite wave curvature, lift the envelope hand slightly, and shorten both jetpack flames. Eyes remain open and smile unchanged. Do not mirror the whole character or move the head. No additional objects, no text. This must alternate smoothly with frame 1.

#### ghoster-02

Create animation frame 2 by editing this exact Ghoster sprite. Preserve canvas size, transparent background, main head/body position and scale, red/plum palette, thick outline, face identity and cream speech bubble on the same side. Change only the lower scalloped tail to sway in the opposite direction with the three tail dots shifted slightly along its movement. Narrow eyelids a little for a sneaky squint, retain smile and speech bubble's three dots. Do not mirror or rotate the whole sprite. No text, no extra objects. This must alternate with frame 1 as an idle ghost wiggle.
