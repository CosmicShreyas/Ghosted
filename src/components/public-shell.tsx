// The frame for story and company pages when the visitor isn't signed in: a simple top bar (Write
// your story, Log in) instead of the private sidebar. Reading needs no account; everything else does.
//
// JoinPrompt is mounted once for the whole site (routes/__root.tsx). It opens:
//   - when a visitor tries to react, chitchat, follow, save… (askToJoin, or any write that gets a 401)
//   - after 5 minutes of reading (components/reading-gate.tsx), with copy about that
// Both buttons come back to this exact page after signing in or up.
import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, HeartHandshake, LogIn, PenLine, UserPlus } from "lucide-react";
import { Brand } from "@/components/site-chrome";
import { ThemeToggle } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiEnabled, NEED_ACCOUNT_EVENT } from "@/lib/api";
import { openStoryComposer } from "@/lib/guest";
import { safeReturnTo, useMe, useTone, voice } from "@/lib/session";
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

export const READING_REASON = "reading";

export function JoinPrompt() {
  const tone = useTone();
  const { signedOut } = useMe();
  const returnTo = useReturnTo();
  const [open, setOpen] = useState<null | "action" | "reading">(null);
  useEffect(() => {
    const f = (e: Event) => setOpen((e as CustomEvent<string>).detail === READING_REASON ? "reading" : "action");
    window.addEventListener(NEED_ACCOUNT_EVENT, f);
    return () => window.removeEventListener(NEED_ACCOUNT_EVENT, f);
  }, []);
  if (!apiEnabled || !signedOut) return null;
  const reading = open === "reading";
  return <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
    <DialogContent className={popup}>
      <div className={popupBody}>
        <span className="grid size-12 place-items-center rounded-xl border-2 border-foreground bg-accent">{reading ? <BookOpen className="size-6" /> : <HeartHandshake className="size-6" />}</span>
        <DialogHeader className="mt-4 text-left">
          <DialogTitle className="font-display text-2xl">{reading ? voice(tone, "Enjoying the receipts?", "Enjoying Ghosted?") : voice(tone, "Join to join in", "Join Ghosted to do that")}</DialogTitle>
          <DialogDescription>{reading
            ? voice(tone, "You've been reading a while. Join free and anonymously to react, chitchat, follow companies and get told when someone shares about yours. Or keep reading, no pressure. (Some pressure.)", "Join free and anonymously to react, chitchat, follow companies and hear about new stories. You can also keep reading.")
            : voice(tone, "Reacting, chitchatting, following and saving need a free account. It's anonymous, and you'll land right back here.", "Reacting, chitchats, follows and saves need a free, anonymous account. You'll come straight back to this page.")}</DialogDescription>
        </DialogHeader>
        <div className="mt-6 flex flex-wrap items-center gap-2"><JoinButtons returnTo={returnTo} />
          {reading && <Button variant="ghost" className="min-h-10" onClick={() => setOpen(null)}>Keep reading</Button>}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Been through a hiring process? <button type="button" className="font-bold text-primary hover:underline" onClick={() => { setOpen(null); openStoryComposer(); }}>Write your story first</button>, join at the end.</p>
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
        <div className="flex items-center gap-2">
          <span className="hidden sm:block"><ThemeToggle className="size-10" /></span>
          <Button variant="outline" size="sm" className="min-h-10" asChild><Link to="/auth" search={{ tab: "login", ...(returnTo && { returnTo }) }}><LogIn /><span className="hidden min-[400px]:inline">Log in</span></Link></Button>
          <Button size="sm" className="min-h-10" onClick={openStoryComposer}><PenLine />Write your story</Button>
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-[1400px] p-4 pb-16 sm:p-6">{children}</main>
  </div>;
}
