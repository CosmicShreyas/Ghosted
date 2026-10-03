// The frame for story and company pages when the visitor isn't signed in: a simple top bar (Join,
// Log in) instead of the private sidebar, and a prompt that opens when they try to react, chitchat,
// follow or save. Both buttons come back to this exact page after signing in or up.
import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { HeartHandshake, LogIn, UserPlus } from "lucide-react";
import { Brand } from "@/components/site-chrome";
import { ThemeToggle } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NEED_ACCOUNT_EVENT } from "@/lib/api";
import { safeReturnTo, useTone, voice } from "@/lib/session";
import { popup, popupBody } from "@/components/dashboard/ui-kit";

function useReturnTo() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return safeReturnTo(path) ?? undefined;
}

function JoinButtons({ returnTo, compact = false }: { returnTo: string | undefined; compact?: boolean }) {
  return <div className="flex items-center gap-2">
    <Button variant="outline" size={compact ? "sm" : "default"} className="min-h-10" asChild><Link to="/auth" search={{ tab: "login", ...(returnTo && { returnTo }) }}><LogIn />Log in</Link></Button>
    <Button size={compact ? "sm" : "default"} className="min-h-10" asChild><Link to="/auth" search={{ ...(returnTo && { returnTo }) }}><UserPlus />Join</Link></Button>
  </div>;
}

export function JoinPrompt() {
  const tone = useTone();
  const returnTo = useReturnTo();
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener(NEED_ACCOUNT_EVENT, f); return () => window.removeEventListener(NEED_ACCOUNT_EVENT, f); }, []);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className={popup}>
      <div className={popupBody}>
        <span className="grid size-12 place-items-center rounded-xl border-2 border-foreground bg-accent"><HeartHandshake className="size-6" /></span>
        <DialogHeader className="mt-4 text-left">
          <DialogTitle className="font-display text-2xl">{voice(tone, "Join to join in", "Join Ghosted to do that")}</DialogTitle>
          <DialogDescription>{voice(tone, "Reacting, chitchatting, following and saving need a free account. It's anonymous, and you'll land right back here.", "Reacting, chitchats, follows and saves need a free, anonymous account. You'll come straight back to this page.")}</DialogDescription>
        </DialogHeader>
        <div className="mt-6"><JoinButtons returnTo={returnTo} /></div>
      </div>
    </DialogContent>
  </Dialog>;
}

export function PublicShell({ children }: { children: ReactNode }) {
  const returnTo = useReturnTo();
  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6">
        <Brand />
        <div className="flex items-center gap-2"><span className="hidden sm:block"><ThemeToggle className="size-10" /></span><JoinButtons returnTo={returnTo} compact /></div>
      </div>
    </header>
    <main className="mx-auto max-w-[1400px] p-4 pb-16 sm:p-6">{children}</main>
    <JoinPrompt />
  </div>;
}
