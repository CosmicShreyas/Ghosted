import { motion } from "motion/react";
import { Check, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Common patterns people reach for. Not exhaustive; the server's own checks are the real gate.
const COMMON = /^(password|qwerty|letmein|welcome|iloveyou|admin|ghosted|abc123|monkey|dragon|india|123456)/i;
const SEQUENCE = /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i;
const REPEAT = /(.)\1{3,}/;

type Level = { label: string; quip: string; tone: string; bar: string };

// Job-ladder levels: longer passwords with variety climb higher.
const LEVELS: Level[] = [
  { label: "Intern", quip: "A recruiter could guess this before the screening call.", tone: "text-flag-red", bar: "bg-flag-red" },
  { label: "On probation", quip: "Getting there. A few more characters and you're confirmed.", tone: "text-flag-amber", bar: "bg-flag-amber" },
  { label: "Mid-level", quip: "Solid work. A longer phrase would get you promoted.", tone: "text-flag-amber", bar: "bg-flag-amber" },
  { label: "Senior", quip: "Even a six-round panel couldn't crack this one.", tone: "text-flag-green", bar: "bg-flag-green" },
  { label: "Principal", quip: "Uncrackable. This password comes with ESOPs.", tone: "text-flag-green", bar: "bg-flag-green" },
];

export function scorePassword(password: string, personal: string[] = []) {
  const lower = password.toLowerCase();
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const words = password.trim().split(/\s+/).filter((w) => w.length >= 3).length;
  // Only real bits of the user's name or email (3+ letters) count as "personal".
  const personalHit = personal.flatMap((p) => p.toLowerCase().split(/[^a-z0-9]+/)).some((part) => part.length >= 3 && lower.includes(part));
  const obvious = COMMON.test(password) || SEQUENCE.test(password) || REPEAT.test(password);
  const weak = obvious || personalHit;

  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14 || words >= 3) score++;
  if (kinds >= 3) score++;
  if (password.length >= 18 || (words >= 4 && password.length >= 16)) score++;
  // Guessable patterns go straight to the bottom; containing your own name or email caps at level 1.
  if (obvious) score = 0;
  else if (personalHit) score = Math.min(score, 1);
  if (password.length < 10) score = 0;

  const checks = [
    { ok: password.length >= 10, text: "At least 10 characters" },
    { ok: password.length >= 14 || words >= 3, text: "14+ characters, or a few words together" },
    { ok: kinds >= 3, text: "Mix of letters, numbers or symbols" },
    { ok: password.length > 0 && !weak, text: "No name, email or obvious patterns" },
  ];
  return { score, level: LEVELS[score]!, checks };
}

export function PasswordStrength({ password, personal = [] }: { password: string; personal?: string[] }) {
  if (!password) return null;
  const { score, level, checks } = scorePassword(password, personal);
  const strong = score >= 3;
  // Show one tip at a time, the most useful one still missing.
  const next = checks.find((c) => !c.ok);

  return <div className="rounded-xl border-2 border-foreground bg-card p-3" aria-live="polite">
    <div className="flex items-center justify-between gap-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground">
        {strong ? <ShieldCheck className="size-4 text-flag-green" /> : <ShieldAlert className={cn("size-4", level.tone)} />}
        Hijack-proof level
      </p>
      <motion.p key={level.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn("text-sm font-bold", level.tone)}>{level.label}</motion.p>
    </div>
    <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-2 overflow-hidden rounded-full border border-foreground bg-muted">
        <motion.div className={cn("h-full", level.bar)} initial={false} animate={{ width: i < score ? "100%" : "0%" }} transition={{ type: "spring", stiffness: 260, damping: 26, delay: i * 0.04 }} />
      </div>)}
    </div>
    <p className="mt-2 text-xs">{level.quip}</p>
    {next && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><X className="size-3.5 shrink-0 text-flag-red" />Next step: {next.text.toLowerCase()}.</p>}
    {!next && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5 shrink-0 text-flag-green" strokeWidth={3} />Your account is safe from HR detectives.</p>}
  </div>;
}
