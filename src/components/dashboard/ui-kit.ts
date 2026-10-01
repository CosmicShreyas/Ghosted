// Shared class names for dashboard cards and popups (kept apart from components to avoid import cycles).

export const scoreTone = (s: number) => (s >= 70 ? "text-flag-green" : s >= 40 ? "text-flag-amber" : "text-flag-red");
export const card = "rounded-xl border-2 border-foreground bg-card shadow-hard-sm";

// Shared frame for centred popups. The frame itself never scrolls (so the ✕ stays put and the
// scrollbar can't run across the rounded border); the inner `popupBody` scrolls instead.
// Never wider than the screen minus a 1 rem margin on each side, so nothing slides sideways.
export const popup = "flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-xl border-2 border-foreground bg-card p-0 shadow-hard";
// `relative` keeps visually hidden elements (sr-only inputs, the hidden inputs Radix checkboxes and
// selects render) inside the scroll area; without it Chrome counts them toward the scroll height and
// the popup gets a blank stretch below its last button.
export const popupBody = "relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-5 sm:p-7";
