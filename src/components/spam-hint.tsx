// Under every "we emailed you a code" step: a highlighted reminder that the email may have landed in
// Spam or Promotions (Gmail does this to new senders), how to stop it happening again, and the
// resend button.
import { MailWarning } from "lucide-react";
import { useTone, voice } from "@/lib/session";

export function SpamHint({ cooldown, disabled, onResend }: { cooldown: number; disabled?: boolean; onResend: () => void }) {
  const tone = useTone();
  return <div role="note" className="flex items-start gap-2 rounded-lg border-2 border-foreground bg-[#FDF3B4] p-3 text-sm text-[#141110]">
    <MailWarning className="mt-0.5 size-4 shrink-0" />
    <p>
      <mark className="rounded bg-[#FACC15] px-1 font-bold text-[#141110]">Can't see it? Check your Spam and Promotions folders.</mark>{" "}
      {voice(tone, "Email apps love hiding new senders. If it's there, tap \"Not spam\" so the next one lands properly.", "If it's there, mark it as \"Not spam\" so future emails reach your inbox.")}{" "}
      Still nothing after a minute?{" "}
      <button type="button" disabled={cooldown > 0 || disabled} onClick={onResend} className="font-bold underline underline-offset-2 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60">{cooldown > 0 ? `Request a new code in ${cooldown}s` : "Request a new code"}</button>
    </p>
  </div>;
}
