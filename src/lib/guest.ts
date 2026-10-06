// Visiting without an account, Reddit-style: read anything, write your story first, join last.
//   openStoryComposer()   opens the story form from anywhere (the landing page's "Write your story"),
//                         signed in or not (components/guest-composer.tsx)
//   postAfterJoin         set when a visitor finishes a story and taps "Join and post": after sign-up
//                         or log-in the form reopens on its last step with the draft (which the form
//                         already keeps in this browser), ready to post
//   reading time          seconds a signed-out visitor has spent reading, across pages; the join
//                         popup appears at 5 minutes (components/reading-gate.tsx)
export const OPEN_COMPOSER_EVENT = "ghosted:open-composer";
export const openStoryComposer = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_COMPOSER_EVENT)); };

const POST_KEY = "ghosted.postAfterJoin";
export const postAfterJoin = {
  set: () => { try { localStorage.setItem(POST_KEY, String(Date.now())); } catch { /* storage blocked */ } },
  // Only a recent one counts (an hour), so an old abandoned draft never pops up out of nowhere.
  pending: () => { try { const t = Number(localStorage.getItem(POST_KEY) ?? 0); return t > 0 && Date.now() - t < 3600_000; } catch { return false; } },
  clear: () => { try { localStorage.removeItem(POST_KEY); } catch { /* storage blocked */ } },
};

const READ_KEY = "ghosted.readSeconds";
export const readingTime = {
  get: () => { try { return Number(localStorage.getItem(READ_KEY) ?? 0) || 0; } catch { return 0; } },
  set: (s: number) => { try { localStorage.setItem(READ_KEY, String(Math.max(0, Math.round(s)))); } catch { /* storage blocked */ } },
};
