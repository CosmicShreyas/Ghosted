// The story form, openable from anywhere (openStoryComposer in lib/guest.ts): the landing page's
// "Write your story", the public top bar, the join prompt. Signed out, it's the full form with
// "Join and post" at the end. Loaded only when first opened.
import { lazy, Suspense, useEffect, useState } from "react";
import { OPEN_COMPOSER_EVENT } from "@/lib/guest";

const ShareModal = lazy(() => import("@/components/dashboard/share-story").then((m) => ({ default: m.ShareModal })));

export function GuestComposer() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const f = () => { setLoaded(true); setOpen(true); };
    window.addEventListener(OPEN_COMPOSER_EVENT, f);
    return () => window.removeEventListener(OPEN_COMPOSER_EVENT, f);
  }, []);
  if (!loaded) return null;
  return <Suspense fallback={null}><ShareModal open={open} onOpenChange={setOpen} /></Suspense>;
}
