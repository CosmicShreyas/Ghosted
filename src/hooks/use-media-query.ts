import { useEffect, useState } from "react";

// True while `query` matches. False during server render and the first client render, then updates,
// so server and client HTML match.
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return matches;
}

// Phones and tablets: below Tailwind's `lg` breakpoint (1024 px), where the dashboard uses the
// bottom dock and bottom sheets instead of the sidebar and dropdowns.
export const useIsTouchLayout = () => useMediaQuery("(max-width: 1023.98px)");
