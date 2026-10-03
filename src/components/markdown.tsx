// Markdown for stories. Safe by construction: react-markdown never renders raw HTML, and only a small
// set of elements is allowed. Links and images are shown as their text (no spam, no tracking pixels),
// and headings are kept small so no story can shout.
import { useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Every heading level is allowed (a disallowed element is flattened to plain text), sized down from
// # to ###### so a story's structure shows without any one story shouting over the feed.
const ALLOWED = ["p", "strong", "em", "del", "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "br"];

const headingClass = "font-display font-bold leading-snug first:mt-0";
const components: Components = {
  h1: ({ children }) => <h3 className={cn(headingClass, "mb-2 mt-5 text-xl sm:text-2xl")}>{children}</h3>,
  h2: ({ children }) => <h4 className={cn(headingClass, "mb-2 mt-5 text-lg sm:text-xl")}>{children}</h4>,
  h3: ({ children }) => <h5 className={cn(headingClass, "mb-1.5 mt-4 text-base sm:text-lg")}>{children}</h5>,
  h4: ({ children }) => <h6 className={cn(headingClass, "mb-1.5 mt-4 text-base")}>{children}</h6>,
  h5: ({ children }) => <h6 className={cn(headingClass, "mb-1 mt-3 text-sm uppercase tracking-wide")}>{children}</h6>,
  h6: ({ children }) => <h6 className={cn(headingClass, "mb-1 mt-3 text-sm text-muted-foreground")}>{children}</h6>,
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-muted-foreground">{children}</del>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-primary">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:font-bold marker:text-primary">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-3 rounded-r-lg border-l-4 border-primary bg-primary/5 py-1.5 pl-3 pr-2 italic">{children}</blockquote>,
  // Inline `code`: a violet-tinted chip. Inside a fenced block it's reset by the pre styles below.
  code: ({ children, className }) => <code className={cn("rounded-md border border-primary/25 bg-primary/10 px-1.5 py-px font-mono text-[0.85em] text-primary", className)}>{children}</code>,
  // Fenced ``` blocks: a dark, terminal-style panel (with the language as a label when given).
  pre: ({ children, node }) => {
    const lang = /language-([\w+-]+)/.exec(String((node?.children?.[0] as { properties?: { className?: string[] } } | undefined)?.properties?.className ?? ""))?.[1];
    return <div className="my-3 overflow-hidden rounded-lg border-2 border-foreground bg-foreground text-background shadow-hard-sm">
      {lang && <div className="border-b border-background/15 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-background/60">{lang}</div>}
      <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">{children}</pre>
    </div>;
  },
  hr: () => <hr className="my-4 border-t-2 border-dashed border-foreground/20" />,
};

export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={cn("min-w-0 break-words [overflow-wrap:anywhere]", className)}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} allowedElements={ALLOWED} unwrapDisallowed components={components}>{text}</ReactMarkdown>
  </div>;
}

// A story's body in the feed: Markdown, folded to ~9 lines with "Read more" when it's long.
export function StoryBody({ text, className, fold = true }: { text: string; className?: string; fold?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => { if (fold && ref.current) setLong(ref.current.scrollHeight > 240); }, [text, fold]);
  return <div className={className}>
    <div ref={ref} className={cn("relative", fold && !open && long && "max-h-[15rem] overflow-hidden")}>
      <Markdown text={text} />
      {fold && !open && long && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />}
    </div>
    {/* Phones and tablets: no toggle, tapping the card opens the story page to read the rest. */}
    {fold && long && <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 hidden lg:inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
      {open ? "Show less" : "Read more"}<ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
    </button>}
  </div>;
}

// Plain text of a Markdown body, for short snippets (company popup, search, notifications).
export const plainText = (md: string) => md
  .replace(/```[\s\S]*?```/g, " ").replace(/`([^`]*)`/g, "$1")
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "").replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, "$2")
  .replace(/\s+/g, " ").trim();
