import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Sidebar, Topbar, type View } from "@/components/dashboard/shell";
import { FeedStory } from "@/components/dashboard/widgets";
import { ShareModal } from "@/components/dashboard/share-story";
import { ChitchatThread } from "@/components/dashboard/chitchats";
import { CompanyRail, StoryCompanyCard } from "@/components/dashboard/company-page";
import { LogoutDialog } from "@/components/dashboard/confirm-dialogs";
import { Preloader } from "@/components/preloader";
import { PublicShell } from "@/components/public-shell";
import { pageHead } from "@/lib/meta";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { api, apiEnabled } from "@/lib/api";
import { useCompanyPage } from "@/lib/companies";
import { useLive } from "@/lib/live";
import { useSaved } from "@/lib/saved";
import { useAccountActions, useAuthGuard, useMe } from "@/lib/session";
import { fromApi, sampleModels, useCompanyIndex, type StoryDto, type StoryModel } from "@/lib/stories";
import { useQueryClient } from "@tanstack/react-query";
import type { Company } from "@/mock/data";

// One story, in full: the story and its chitchat thread on the left; on the right the company it's
// about (follow, bell, company page) and that company's numbers. Phones and tablets stack it: story,
// company card, a swipeable strip of numbers, then chitchats.
export const Route = createFileRoute("/s/$id")({
  // Shared links get a proper preview, but never the story's text, and story pages stay out of search.
  head: ({ params }) => pageHead({ title: "A hiring story on Ghosted", description: "Read a real candidate's hiring experience, shared anonymously on Ghosted.", type: "article", noindex: true, path: `/s/${params.id}` }),
  component: StoryPage,
});

function StoryPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me } = useMe();
  const { waiting, signedOut } = useAuthGuard("optional");
  const { logout } = useAccountActions();
  const { index, ready } = useCompanyIndex();
  const [saved, toggleSave] = useSaved();
  const [share, setShare] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const q = useQuery({ queryKey: ["story", id], queryFn: async () => (await api<{ story: StoryDto }>(`/v1/stories/${id}`)).story, enabled: apiEnabled && ready, retry: false });
  // Reactions, edits and new chitchats on this story keep its numbers fresh.
  useLive(apiEnabled ? `story:${id}` : null, () => void qc.invalidateQueries({ queryKey: ["story", id] }));
  const story: StoryModel | null = apiEnabled ? (q.data ? fromApi(q.data, index) : null) : sampleModels().find((s) => s.id === id) ?? null;
  const goView = (v: View) => navigate({ to: "/dashboard", search: { view: v } });
  const openCompany = (c: Company) => navigate({ to: "/c/$slug", params: { slug: c.id } });

  // Arriving from a "chitchats" link: land on the thread once it's rendered.
  useEffect(() => {
    if (story && window.location.hash === "#chitchats") window.setTimeout(() => document.getElementById("chitchats")?.scrollIntoView({ block: "start" }), 300);
  }, [story?.id]);

  if (waiting || (apiEnabled && (q.isPending || !ready))) return <Preloader />;

  const body = story ? <StoryLayout story={story} saved={saved.has(story.id)} onSave={() => toggleSave(story.id)} onOpenCompany={openCompany} />
    : <div className="mx-auto max-w-lg rounded-xl border-2 border-dashed border-foreground/40 p-10 text-center">
        <p className="font-display text-xl font-bold">This story isn't here any more</p>
        <p className="mt-2 text-sm text-muted-foreground">Its author may have deleted it.</p>
        <Button className="mt-5" variant="outline" asChild><Link to={signedOut ? "/" : "/dashboard"}><ArrowLeft />{signedOut ? "Go to Ghosted" : "Back to the feed"}</Link></Button>
      </div>;
  // Signed out: readable, with a simple top bar; actions open the join prompt.
  if (signedOut) return <PublicShell>{body}</PublicShell>;

  return <div className="min-h-screen bg-background lg:pl-60">
    <Sidebar view={null} onChange={goView} me={me} savedCount={saved.size} />
    <Topbar query="" onQuery={() => undefined} onShare={() => setShare(true)} me={me} view={null} onChange={goView} onLogout={() => setConfirmLogout(true)} savedCount={saved.size} />
    <main className="mx-auto max-w-[1400px] p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">{body}</main>
    <ShareModal open={share} onOpenChange={setShare} presetCompany={story?.company.id ?? null} />
    <LogoutDialog open={confirmLogout} onOpenChange={setConfirmLogout} onConfirm={async () => { await logout(); setConfirmLogout(false); navigate({ to: "/auth" }); }} />
  </div>;
}

function StoryLayout({ story, saved, onSave, onOpenCompany }: { story: StoryModel; saved: boolean; onSave: () => void; onOpenCompany: (c: Company) => void }) {
  const navigate = useNavigate();
  const company = useCompanyPage(story.company.id);
  const page = company.page;
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="min-w-0 space-y-5">
      <BackButton />
      <FeedStory story={story} saved={saved} onSave={onSave} onOpenCompany={onOpenCompany} full />

      {/* Phones/tablets: no company card or numbers under the story; the company name in the
          story links to its page. Desktop keeps them in the right-hand rail. */}

      <ChitchatThread storyId={story.id} storyAuthorId={story.author.publicId} />
    </div>

    {/* Desktop: company first, then its numbers, pinned while the story and chitchats scroll. */}
    <aside data-lenis-prevent className="hidden space-y-5 xl:sticky xl:top-[5.5rem] xl:block xl:max-h-[calc(100vh-6.5rem)] xl:self-start xl:overflow-y-auto xl:overflow-x-hidden xl:overscroll-contain xl:pb-2 xl:pr-2 no-scrollbar">
      {page ? <><StoryCompanyCard page={page} hook={company} /><CompanyRail page={page} /></>
        : company.loading ? <div className="skeleton h-72 rounded-xl" /> : null}
    </aside>
  </div>;
}
