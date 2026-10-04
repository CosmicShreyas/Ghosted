// The Ghost Blasters share card: a 1200x630 image of your run, drawn on a canvas in the game's
// style. Phones get the native share sheet with the image; elsewhere the image downloads and the
// text is copied. It shows the score only: no handle, nothing about who you are.
import { artImage, ENEMY_INFO, preloadArt, type RunResult } from "@/game/ghost-blasters";

const C = { violet: "#6D28D9", lilac: "#9F7AEA", cream: "#F2E9D8", ink: "#16111D", green: "#22C55E", amber: "#F59E0B", red: "#EF4444" };

export function shareText(r: RunResult, url: string) {
  return `I reached ${r.xp.toLocaleString("en-IN")} Experience in Ghost Blasters on Ghosted (${r.offers} ${r.offers === 1 ? "offer" : "offers"}, level ${r.level}). Taken out by ${ENEMY_INFO[r.killer].name}. Beat that: ${url}`;
}

async function draw(r: RunResult) {
  await preloadArt();
  await document.fonts?.ready;
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const g = c.getContext("2d")!;
  g.fillStyle = C.ink; g.fillRect(0, 0, 1200, 630);
  // A scatter of stars, the same every time (seeded by position).
  for (let i = 0; i < 140; i++) { const x = (i * 337) % 1200, y = (i * 191) % 630; g.globalAlpha = 0.25 + ((i * 7) % 10) / 20; g.fillStyle = i % 3 ? C.lilac : C.cream; g.fillRect(x, y, 2.5, 2.5); }
  g.globalAlpha = 1;
  // Card.
  g.fillStyle = C.violet; g.fillRect(70, 78, 1060, 474);
  g.fillStyle = C.cream; g.strokeStyle = C.ink; g.lineWidth = 6;
  g.fillRect(56, 64, 1060, 474); g.strokeRect(56, 64, 1060, 474);
  // Ship, with its flames.
  const ship = artImage("ship"), flame = artImage("flame");
  if (flame) for (const dx of [-0.153, 0.15]) g.drawImage(flame, 830 + dx * 340 - 105, 300 + 0.262 * 340 - 0.223 * 210, 210, 210);
  if (ship) g.drawImage(ship, 830 - 170, 300 - 170, 340, 340);
  // Words.
  g.fillStyle = C.violet; g.font = "700 30px 'Space Grotesk', system-ui, sans-serif"; g.fillText("Ghost Blasters", 100, 130);
  g.fillStyle = C.ink; g.font = "700 150px 'Space Grotesk', system-ui, sans-serif"; g.fillText(r.xp.toLocaleString("en-IN"), 92, 290);
  g.font = "700 34px 'Space Grotesk', system-ui, sans-serif"; g.fillText("Experience", 100, 340);
  g.font = "600 26px Inter, system-ui, sans-serif"; g.fillStyle = "#4b4453";
  g.fillText(`${r.offers} ${r.offers === 1 ? "offer" : "offers"} · level ${r.level} · ${r.seconds}s`, 100, 390);
  g.fillStyle = C.red; g.font = "700 24px Inter, system-ui, sans-serif"; g.fillText(`Taken out by ${ENEMY_INFO[r.killer].name}`, 100, 450);
  g.fillStyle = C.ink; g.font = "700 26px 'Space Grotesk', system-ui, sans-serif"; g.fillText("Ghosted · real hiring experiences", 100, 500);
  return new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
}

// Returns what happened, so the page can say "Shared", "Image saved" or "Copied".
export async function shareRun(r: RunResult): Promise<"shared" | "downloaded" | "copied" | "cancelled" | "failed"> {
  const url = `${window.location.origin}/dashboard?view=play`;
  const text = shareText(r, url);
  try {
    const blob = await draw(r);
    const file = blob ? new File([blob], "ghost-blasters.png", { type: "image/png" }) : null;
    if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return "shared"; }
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) { await navigator.share({ text, url }); return "shared"; }
    if (blob) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "ghost-blasters.png"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      await navigator.clipboard?.writeText(text).catch(() => undefined);
      return "downloaded";
    }
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch (e) {
    if ((e as Error).name === "AbortError") return "cancelled"; // closed the share sheet
    try { await navigator.clipboard.writeText(text); return "copied"; } catch { return "failed"; }
  }
}
