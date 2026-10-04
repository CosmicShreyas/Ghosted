import { useEffect, useState } from "react";
import { Loader2, LogOut, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HumanCheck, useHumanCheck } from "@/components/human-check";
import { ApiRequestError, apiEnabled } from "@/lib/api";
import { cn } from "@/lib/utils";

// Themed confirmation dialogs. Buttons are plain Buttons (not AlertDialogAction) so the dialog stays
// open while the request runs and can show a spinner; it closes itself only on success.

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => Promise<void> };

// A 1 rem margin on phones (never edge to edge), rounded at every size, left-aligned like the other
// popups, and scrolls inside itself on very short screens.
// grid-cols-[minmax(0,1fr)] + [&>*]:min-w-0: the dialog is a grid, and a grid column otherwise grows
// to fit its widest child (the Shield line), pushing everything past the edge with a sideways scrollbar.
const shell = "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-md grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border-2 border-foreground bg-card p-5 shadow-hard sm:p-6 [&>*]:min-w-0";

function useBusy(open: boolean) {
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) setBusy(false); }, [open]);
  return [busy, setBusy] as const;
}

export function LogoutDialog({ open, onOpenChange, onConfirm, everywhere = false }: Props & { everywhere?: boolean }) {
  const [busy, setBusy] = useBusy(open);
  return <AlertDialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
    <AlertDialogContent className={shell}>
      <AlertDialogHeader className="text-left">
        <div className="mb-2 grid size-12 place-items-center rounded-xl border-2 border-foreground bg-accent"><LogOut className="size-5" /></div>
        <AlertDialogTitle className="font-display text-2xl">{everywhere ? "Log out on every device?" : "Log out of Ghosted?"}</AlertDialogTitle>
        <AlertDialogDescription>{everywhere ? "Every session on every phone, laptop and forgotten browser tab ends right now, including this one. Handy if you think someone else got in." : "You'll need your email and password to get back in. Your stories stay exactly where they are, still anonymous."}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row [&>button]:w-full sm:[&>button]:w-auto">
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Stay</Button>
        <Button disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{busy ? <><Loader2 className="animate-spin" />Logging out…</> : <><LogOut />{everywhere ? "Log out everywhere" : "Log out"}</>}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

const LOSSES = ["Your stories and ratings", "Your chitchats and reactions", "Your handle, avatar and profile", "Your saved details (encrypted name, role, city, LinkedIn)"];

// Needs the typed DELETE *and* a passed Ghosted Shield check, so a stolen session or a script
// can't wipe an account. The server enforces the same check.
export function DeleteAccountDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (captchaToken: string | undefined) => Promise<void> }) {
  const [busy, setBusy] = useBusy(open);
  const [typed, setTyped] = useState("");
  useEffect(() => { if (!open) setTyped(""); }, [open]);
  const armed = typed === "DELETE";
  // The check starts solving when the dialog opens (it takes about a second, while you type DELETE),
  // re-solves itself before expiring and after every use, since tokens are single-use.
  const shield = useHumanCheck(open);
  const shieldReady = !apiEnabled || shield.status === "done";
  const confirm = async () => {
    setBusy(true);
    let escalated = false;
    try { await onConfirm(shield.getToken()); }
    catch (err) { if (err instanceof ApiRequestError && err.code === "captcha_escalate") { escalated = true; shield.escalate(); } }
    finally { setBusy(false); if (!escalated) shield.reset(); }
  };
  return <AlertDialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
    <AlertDialogContent className={cn(shell, "border-flag-red")}>
      <AlertDialogHeader className="text-left">
        <div className="mb-2 grid size-12 place-items-center rounded-xl border-2 border-foreground bg-flag-red text-primary-foreground"><Trash2 className="size-5" /></div>
        <AlertDialogTitle className="font-display text-2xl">Delete your account forever?</AlertDialogTitle>
        <AlertDialogDescription>This can't be undone. Not even by us. Everything below is permanently erased:</AlertDialogDescription>
      </AlertDialogHeader>
      <ul className="space-y-1.5 rounded-lg border-2 border-foreground bg-background p-3 text-sm">{LOSSES.map((l) => <li key={l} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-flag-red" />{l}</li>)}</ul>
      <label className="block text-sm font-bold">Type <span className="rounded bg-muted px-1.5 py-0.5 font-mono">DELETE</span> to confirm
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" spellCheck={false} placeholder="DELETE" className="mt-1.5 border-2 border-foreground" aria-label="Type DELETE to confirm" />
      </label>
      <HumanCheck shield={shield} />
      <AlertDialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row [&>button]:w-full sm:[&>button]:w-auto">
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Keep my account</Button>
        <Button variant="destructive" disabled={!armed || busy || !shieldReady} onClick={confirm}>{busy ? <><Loader2 className="animate-spin" />Deleting…</> : !shieldReady ? <><Loader2 className="animate-spin" />Human check…</> : !armed ? <><Trash2 />Type DELETE first</> : <><Trash2 />Delete forever</>}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
