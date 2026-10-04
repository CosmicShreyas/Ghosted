// Anonymous handles (src/lib/handles.ts): funny desi names first, no robot-sounding words handed out,
// every generated name still valid, and the site and API generators stay identical.
import { describe, expect, it } from "vitest";
import { handleFromSeed, isGeneratedHandle, randomHandle } from "@/lib/handles";
import * as api from "../../backend/src/lib/handles";

const ROBOTIC = ["Ultra", "Turbo", "Mega", "Hyper", "Nano", "Micro", "Glitchy", "Pixelated", "Asteroid", "Router", "Pager", "Lanyard", "Quasar", "Satellite", "Keyboard"];
const words = (h: string) => h.split(" ");

describe("randomHandle", () => {
  const many = Array.from({ length: 3000 }, randomHandle);
  it("never hands out a robot-sounding word", () => {
    for (const h of many) for (const w of words(h)) expect(ROBOTIC).not.toContain(w);
  });
  it("is always a valid generated handle (so the API accepts it at sign-up)", () => {
    for (const h of many) { expect(isGeneratedHandle(h)).toBe(true); expect(api.isGeneratedHandle(h)).toBe(true); }
  });
  it("leans on the funny desi names", () => {
    const desi = many.filter((h) => /Samosa|Dosa|Idli|Chai|Biryani|Vada|Momos|Jalebi|Poha|Rasam|Sambar|Dhokla|PavBhaji|Golgappa|Laddoo|Murukku|Rajma|Khichdi|Pongal|Upma|Chole|Kulcha|Thepla|Misal|Appam|Puttu|Payasam|NimbuPani|FilterCoffee|CuttingChai|Paratha|Kachori|Chutney|Pakora|PaniPuri|Mango|Coconut|Jackfruit/.test(words(h)[1]!));
    expect(desi.length / many.length).toBeGreaterThan(0.8);
  });
});

describe("handleFromSeed", () => {
  it("is stable for a seed and matches the API's", () => {
    for (const s of ["new-signup", "u1", "u2", "peep-1234"]) { expect(handleFromSeed(s)).toBe(handleFromSeed(s)); expect(handleFromSeed(s)).toBe(api.handleFromSeed(s)); }
  });
  it("never gives a robot-sounding word either", () => {
    for (let i = 0; i < 2000; i++) for (const w of words(handleFromSeed(`seed-${i}`))) expect(ROBOTIC).not.toContain(w);
  });
});

describe("isGeneratedHandle", () => {
  it("still accepts names members already have, robotic ones included", () => {
    expect(isGeneratedHandle("Ultra Asteroid")).toBe(true);
    expect(api.isGeneratedHandle("Ultra Lanyard")).toBe(true);
  });
});
