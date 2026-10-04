// A password field with an eye button to show or hide what you typed. Used on the main site and the
// admin panel. Takes every normal <input> prop; the eye sits inside the right edge of the field.
import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<typeof Input>, "type">>(({ className, ...props }, ref) => {
  const [show, setShow] = useState(false);
  return <div className="relative">
    <Input ref={ref} type={show ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} {...props} className={cn("pr-12", className)} />
    <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
      className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  </div>;
});
PasswordInput.displayName = "PasswordInput";
