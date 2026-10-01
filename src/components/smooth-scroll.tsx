import Lenis from "lenis";
import { useEffect, useRef } from "react";
import { usePrefs } from "@/lib/prefs";

// The same smooth wheel scrolling for one scrollable box (the sidebar's middle section, …). Put the
// returned ref on the box and keep `data-lenis-prevent` on it too: the page's Lenis then leaves the
// wheel alone there, while this one (which only looks inside the box) takes over.
export function useSmoothScrollIn<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { reduceMotion } = usePrefs();
  useEffect(() => {
    const wrapper = ref.current;
    const content = wrapper?.firstElementChild as HTMLElement | null;
    if (!wrapper || !content || reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ wrapper, content, autoRaf: true, duration: 1.15, smoothWheel: true, syncTouch: false });
    return () => lenis.destroy();
  }, [reduceMotion]);
  return ref;
}

// Smooth wheel scrolling, switched off by the OS "reduce motion" setting or by
// Settings → Appearance → Reduce motion.
export function SmoothScroll() {
  const { reduceMotion } = usePrefs();
  useEffect(() => {
    if (reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      autoRaf: true,
      anchors: true,
      duration: 1.15,
      smoothWheel: true,
      syncTouch: false,
    });

    return () => lenis.destroy();
  }, [reduceMotion]);

  return null;
}
