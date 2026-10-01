// The highlight behind the selected option in a row of buttons (filters, tabs, periods). One pill
// that slides to the selected button's measured position and width, instead of Motion's shared
// layout (layoutId), which can pop out of the row and rejoin it when the page scrolls or re-renders.
//
// Usage: put `ref={pill.ref}` on the row (it must be `relative`), `data-pill={key}` on each option,
// and render <SlidingPill pill={pill} className="…" /> as the row's first child.
import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function usePill<T extends string>(active: T | null | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const measure = () => {
      const el = active ? row.querySelector<HTMLElement>(`[data-pill="${CSS.escape(active)}"]`) : null;
      setBox(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
    };
    measure();
    // Re-measure when the row or its labels change size (fonts loading, window resizes, wrapping).
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    row.querySelectorAll("[data-pill]").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [active]);
  return { ref, box };
}

export function SlidingPill({ pill, className }: { pill: ReturnType<typeof usePill>; className?: string }) {
  if (!pill.box) return null;
  const { x, y, w, h } = pill.box;
  return <motion.span aria-hidden="true" className={cn("pointer-events-none absolute left-0 top-0", className)} initial={false}
    animate={{ x, y, width: w, height: h }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />;
}
