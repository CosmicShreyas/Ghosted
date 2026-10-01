import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar, Topbar, type View } from "@/components/dashboard/shell";
import { ShareModal } from "@/components/dashboard/share-story";
import { LogoutDialog } from "@/components/dashboard/confirm-dialogs";
import { FeedbackSections } from "@/components/dashboard/feedback-page";
import { BackButton } from "@/components/back-button";
import { Preloader } from "@/components/preloader";
import { useSaved } from "@/lib/saved";
import { useAccountActions, useAuthGuard, useMe } from "@/lib/session";

// Feedback, bug reports, contributing and donations. Signed-in only. ?type=bug|feature|feedback
// opens the form on that kind; #build and #back jump to those sections.
type Kind = "bug" | "feature" | "feedback";
export const Route = createFileRoute("/feedback")({
  head: () => ({ meta: [{ title: "Feedback and support | Ghosted" }, { name: "description", content: "Report a bug, suggest a feature, contribute to the open-source code, or support Ghosted." }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): { type?: Kind } => (["bug", "feature", "feedback"].includes(s["type"] as string) ? { type: s["type"] as Kind } : {}),
  component: FeedbackRoute,
});

function FeedbackRoute() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { waiting } = useAuthGuard("private");
  const { logout } = useAccountActions();
  const { type } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [share, setShare] = useState(false);
  const [saved] = useSaved();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const goView = (v: View) => navigate({ to: "/dashboard", search: { view: v } });
  if (waiting) return <Preloader />;

  return <div className="min-h-screen bg-background lg:pl-60">
    <Sidebar view={null} onChange={goView} me={me} savedCount={saved.size} />
    <Topbar query={query} onQuery={setQuery} onShare={() => setShare(true)} me={me} view={null} onChange={goView} onLogout={() => setConfirmLogout(true)} savedCount={saved.size} />
    <main className="mx-auto max-w-6xl p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-10">
      <div className="mb-5"><BackButton /></div>
      <FeedbackSections {...(type && { initialKind: type })} />
    </main>
    <ShareModal open={share} onOpenChange={setShare} />
    <LogoutDialog open={confirmLogout} onOpenChange={setConfirmLogout} onConfirm={async () => { await logout(); setConfirmLogout(false); navigate({ to: "/auth" }); }} />
  </div>;
}
