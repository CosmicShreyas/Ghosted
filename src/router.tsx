import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Data stays fresh for 30 s and in memory for 30 min, so going back to a page shows it instantly
  // instead of refetching. Live updates (src/lib/live.ts) refresh anything that actually changed,
  // so switching tabs doesn't need to refetch everything either.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false, retry: 1 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Hovering or touching a link starts loading that page's code, so the tap feels instant.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
