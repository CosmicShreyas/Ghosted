// The 6-box code input used everywhere a code is emailed (sign-up, sign-in, password reset, Right of
// Reply). Digits only; pasting a whole code fills every box; `onComplete` fires on the 6th digit.
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export function CodeInput({ value, onChange, onComplete, label = "Enter the 6-digit code" }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; label?: string }) {
  return <div>
    <span className="mb-2 block text-sm font-bold">{label}</span>
    <InputOTP maxLength={6} value={value} onChange={(v) => { const digits = v.replace(/\D/g, ""); onChange(digits); if (digits.length === 6) onComplete?.(digits); }} inputMode="numeric" pattern="^[0-9]*$" autoFocus containerClassName="justify-between" aria-label="6-digit code">
      <InputOTPGroup className="w-full justify-between gap-2">{Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="size-12 rounded-lg border-2 border-foreground bg-card font-display text-2xl font-bold first:rounded-lg first:border-l-2 last:rounded-lg sm:size-14" />)}</InputOTPGroup>
    </InputOTP>
  </div>;
}
