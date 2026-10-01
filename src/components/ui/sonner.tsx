import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from "lucide-react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Ghosted-style toasts: 2px ink border, hard offset shadow, and a coloured icon badge per type.
// `unstyled` drops Sonner's defaults so these classes are the whole look.
const badge = "grid size-7 shrink-0 place-items-center rounded-lg border-2 border-foreground";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      gap={10}
      icons={{
        success: <span className={`${badge} bg-flag-green text-primary-foreground`}><CircleCheck className="size-4" strokeWidth={2.5} /></span>,
        error: <span className={`${badge} bg-flag-red text-primary-foreground`}><OctagonX className="size-4" strokeWidth={2.5} /></span>,
        warning: <span className={`${badge} bg-flag-amber text-foreground`}><TriangleAlert className="size-4" strokeWidth={2.5} /></span>,
        info: <span className={`${badge} bg-primary text-primary-foreground`}><Info className="size-4" strokeWidth={2.5} /></span>,
        loading: <span className={`${badge} bg-card`}><Loader2 className="size-4 animate-spin" /></span>,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-xl border-2 border-foreground bg-card p-3.5 pr-4 text-foreground shadow-hard font-sans sm:w-[360px]",
          icon: "!m-0 !size-auto shrink-0",
          content: "min-w-0 flex-1",
          title: "text-sm font-bold leading-snug",
          description: "mt-0.5 text-xs text-muted-foreground",
          actionButton: "shrink-0 rounded-lg border-2 border-foreground bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-hard-sm",
          cancelButton: "shrink-0 rounded-lg border-2 border-foreground bg-muted px-3 py-1 text-xs font-bold",
          closeButton: "!border-2 !border-foreground !bg-card",
          success: "bg-card",
          error: "bg-card",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
