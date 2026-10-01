// "Back" for detail pages (a story, a person, a company). Goes back in history when you came from
// inside Ghosted, otherwise to a sensible page (arriving from a shared link has no "back").
// The arrow nudges once when the page opens, then slides further left with a little trail on hover.
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type Fallback = { to: "/dashboard"; search?: { view?: "companies" } };

export function BackButton({
  label = "Back",
  fallback = { to: "/dashboard" },
  className,
}: {
  label?: string;
  fallback?: Fallback;
  className?: string;
}) {
  const navigate = useNavigate();
  const cameFromHere = () =>
    typeof document !== "undefined" &&
    document.referrer.startsWith(window.location.origin) &&
    window.history.length > 1;
  const go = () => (cameFromHere() ? window.history.back() : void navigate(fallback));
  return (
    <motion.button
      type="button"
      onClick={go}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileTap="tap"
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-card py-1.5 pl-2 pr-4 text-sm font-bold shadow-hard-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
      variants={{ tap: { scale: 0.96 } }}
    >
      <span className="relative grid size-7 place-items-center overflow-hidden rounded-full bg-primary text-primary-foreground">
        {/* A faint copy trails behind the arrow as it slides. */}
        <motion.svg
          viewBox="0 0 24 24"
          className="absolute size-4 opacity-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          variants={{
            rest: { x: 6, opacity: 0 },
            hover: { x: 2, opacity: 0.35, transition: { duration: 0.25 } },
          }}
        >
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </motion.svg>
        <motion.svg
          viewBox="0 0 24 24"
          className="relative size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          initial={false}
          animate={{ x: 0, opacity: 1 }}
          variants={{
            hover: { x: -3, transition: { type: "spring", stiffness: 500, damping: 15 } },
          }}
        >
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </motion.svg>
      </span>
      {label}
    </motion.button>
  );
}
