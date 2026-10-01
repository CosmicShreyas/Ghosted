// Behaviour + environment signals for Ghosted Shield (the human check).
// Privacy: only aggregate numbers are kept (counts, speeds, variances). Never which keys were pressed,
// never coordinates, never anything typed. The summary goes to the server with the check's token.

type Pt = { x: number; y: number; t: number };

const state = {
  start: typeof performance !== "undefined" ? performance.now() : 0,
  moves: 0, path: 0, turns: 0, speeds: [] as number[], first: null as Pt | null, last: null as Pt | null, lastAngle: null as number | null,
  keys: 0, keyGaps: [] as number[], lastKey: 0,
  clicks: 0, touches: 0, scrolls: 0, focusChanges: 0, trusted: 0, untrusted: 0,
  hiddenMs: 0, hiddenSince: 0,
};

const MAX_SAMPLES = 200;
const push = (arr: number[], v: number) => { if (arr.length < MAX_SAMPLES) arr.push(v); };
const track = (e: Event) => { if (e.isTrusted) state.trusted++; else state.untrusted++; };

function onMove(e: PointerEvent) {
  track(e);
  if (e.pointerType === "touch") return;
  const p = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  state.moves++;
  if (!state.first) state.first = p;
  if (state.last) {
    const dx = p.x - state.last.x, dy = p.y - state.last.y, dt = Math.max(1, p.t - state.last.t);
    const dist = Math.hypot(dx, dy);
    state.path += dist;
    if (dist > 2) {
      push(state.speeds, dist / dt);
      const angle = Math.atan2(dy, dx);
      if (state.lastAngle !== null && Math.abs(angle - state.lastAngle) > 0.35) state.turns++;
      state.lastAngle = angle;
    }
  }
  state.last = p;
}

function onKey(e: KeyboardEvent) {
  track(e);
  state.keys++;
  if (state.lastKey) push(state.keyGaps, e.timeStamp - state.lastKey);
  state.lastKey = e.timeStamp;
}

let started = false;
// Starts listening once per page. Passive listeners: zero effect on scrolling or typing.
export function startSignals() {
  if (started || typeof window === "undefined") return;
  started = true;
  const opts = { passive: true, capture: true } as const;
  window.addEventListener("pointermove", onMove, opts);
  window.addEventListener("keydown", onKey, opts);
  window.addEventListener("pointerdown", (e) => { track(e); if (e.pointerType === "touch") state.touches++; else state.clicks++; }, opts);
  window.addEventListener("scroll", () => { state.scrolls++; }, opts);
  window.addEventListener("focus", () => { state.focusChanges++; }, opts);
  window.addEventListener("blur", () => { state.focusChanges++; }, opts);
  // Time spent in a background tab: scripts often "type" into pages nobody is looking at.
  if (document.hidden) state.hiddenSince = performance.now();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) state.hiddenSince = performance.now();
    else if (state.hiddenSince) { state.hiddenMs += performance.now() - state.hiddenSince; state.hiddenSince = 0; }
  });
}

const stats = (xs: number[]) => {
  if (xs.length < 2) return { mean: 0, cv: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { mean, cv: mean ? sd / mean : 0 }; // cv = how uneven the timing is; humans are uneven
};

function webglRenderer() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 80) : "";
  } catch { return ""; }
}

export type Signals = ReturnType<typeof collectSignals>;

export function collectSignals() {
  const straight = state.first && state.last ? Math.hypot(state.last.x - state.first.x, state.last.y - state.first.y) : 0;
  const speed = stats(state.speeds), keys = stats(state.keyGaps);
  const nav = navigator as Navigator & { webdriver?: boolean; userAgentData?: { brands?: { brand: string }[] } };
  return {
    v: 1,
    dwell: Math.round(performance.now() - state.start),
    moves: state.moves,
    path: Math.round(state.path),
    straightness: state.path > 0 ? +(straight / state.path).toFixed(3) : 0, // 1 = perfectly straight line
    turns: state.turns,
    speedCv: +speed.cv.toFixed(3),
    keys: state.keys,
    keyCv: +keys.cv.toFixed(3),
    keyMean: Math.round(keys.mean),
    clicks: state.clicks, touches: state.touches, scrolls: state.scrolls, focus: state.focusChanges,
    untrusted: state.untrusted, trusted: state.trusted,
    env: {
      webdriver: nav.webdriver === true,
      ua: navigator.userAgent.slice(0, 200),
      brands: (nav.userAgentData?.brands ?? []).map((b) => b.brand).join(",").slice(0, 120),
      langs: navigator.languages?.length ?? 0,
      cores: navigator.hardwareConcurrency ?? 0,
      touchPoints: navigator.maxTouchPoints ?? 0,
      screen: [screen.width, screen.height],
      outer: [window.outerWidth, window.outerHeight],
      renderer: webglRenderer(),
      finePointer: matchMedia("(pointer: fine)").matches,
      plugins: navigator.plugins?.length ?? 0,
      chromeObj: typeof (window as unknown as { chrome?: unknown }).chrome === "object",
      hiddenMs: Math.round(state.hiddenMs + (state.hiddenSince ? performance.now() - state.hiddenSince : 0)),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    },
  };
}
