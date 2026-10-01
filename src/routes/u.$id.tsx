import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, VolumeX } from "lucide-react";
import { Sidebar, Topbar, type View } from "@/components/dashboard/shell";
import { FeedStory } from "@/components/dashboard/widgets";
import { ShareModal } from "@/components/dashboard/share-story";
import { PersonActions, PersonHeader, PersonRail, ReportPersonDialog } from "@/components/dashboard/person";
import { LogoutDialog } from "@/components/dashboard/confirm-dialogs";
import { Preloader } from "@/components/preloader";
import { BackButton } from "@/components/back-button";
import { GoofyActivityFeed, GoofyFollow, GoofyHeader, GoofyRail } from "@/components/dashboard/goofy-page";
import { Button } from "@/components/ui/button";
import { useReachEnd, useStoryFeed } from "@/lib/feed";
import { usePerson } from "@/lib/people";
import { useSaved } from "@/lib/saved";
import { useAccountActions, useAuthGuard, useMe } from "@/lib/session";
import type { StoryModel } from "@/lib/stories";
import type { Company } from "@/mock/data";

// A person's page, addressed only by their 15-digit public id (never a name or an internal id).
export const Route = createFileRoute("/u/$id")({
  head: () => ({ meta: [{ title: "Profile | Ghosted" }, { name: "description", content: "Their hiring stories, the companies they've reviewed, and how the community reacted." }, { name: "robots", content: "noindex" }] }),
  component: PersonPageRoute,
});

const matches = (s: StoryModel, q: string) => !q || `${s.outcomeLabel} ${s.role ?? ""} ${s.title ?? ""} ${s.body} ${s.company.name}`.toLowerCase().includes(q.toLowerCase());

function PersonPageRoute() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { me } = useMe();
  const { waiting } = useAuthGuard("private");
  const { logout } = useAccountActions();
  const person = usePerson(id);
  const [query, setQuery] = useState("");
  const [share, setShare] = useState(false);
  const setCompany = (c: Company) => navigate({ to: "/c/$slug", params: { slug: c.id } });
  const [saved, toggleSave] = useSaved();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [reporting, setReporting] = useState(false);
  const page = person.page;

  // Their stories, paged and live (a new story from them appears here straight away).
  const feed = useStoryFeed({ sample: page?.stories ?? [], signature: `${id}|${query}`, filter: (s) => matches(s, query), path: `/v1/profiles/${id}/stories`, topic: `person:${id}`, enabled: !page?.profile.bot });
  const sentinel = useReachEnd(feed.loadMore, feed.hasMore);

  const goView = (v: View) => navigate({ to: "/dashboard", search: { view: v } });
  if (waiting || person.loading) return <Preloader />;

  const shell = (body: React.ReactNode) => <div className="min-h-screen bg-background lg:pl-60">
    <Sidebar view={null} onChange={goView} me={me} savedCount={saved.size} />
    <Topbar query={query} onQuery={setQuery} onShare={() => setShare(true)} me={me} view={null} onChange={goView} onLogout={() => setConfirmLogout(true)} savedCount={saved.size} />
    <main className="mx-auto max-w-[1500px] p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">{body}</main>
    <ShareModal open={share} onOpenChange={setShare} />
    <LogoutDialog open={confirmLogout} onOpenChange={setConfirmLogout} onConfirm={async () => { await logout(); setConfirmLogout(false); navigate({ to: "/auth" }); }} />
  </div>;

  if (person.notFound || person.error || !page) return shell(<div className="mx-auto max-w-lg rounded-xl border-2 border-dashed border-foreground/40 p-10 text-center">
    <p className="font-display text-xl font-bold">{person.error ? "Couldn't load this page" : "Nobody here"}</p>
    <p className="mt-2 text-sm text-muted-foreground">{person.error ? "Check your connection and try again." : "This person may have deleted their account. Ghosting: it's contagious."}</p>
    <Button className="mt-5" variant="outline" asChild><Link to="/dashboard"><ArrowLeft />Back to the feed</Link></Button>
  </div>);

  const name = page.profile.name;
  // Goofy, the AutoMod: his own layout (activity instead of stories, his numbers on the right).
  if (page.profile.bot && page.goofy) return shell(<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-w-0 space-y-6">
      <BackButton />
      <GoofyHeader page={page} actions={<GoofyFollow page={page} person={person} />} />
      <section className="xl:hidden"><p className="mb-3 text-xs font-bold uppercase text-primary">Swipe for his stats</p><GoofyRail stats={page.goofy} layout="strip" /></section>
      <GoofyActivityFeed page={page} />
    </div>
    <div data-lenis-prevent className="hidden xl:sticky xl:top-[5.5rem] xl:block xl:max-h-[calc(100vh-6.5rem)] xl:self-start xl:overflow-y-auto xl:overflow-x-hidden xl:overscroll-contain xl:pb-2 xl:pr-2 no-scrollbar"><GoofyRail stats={page.goofy} /></div>
  </div>);
  // Live list when there's an API; the sample page's stories otherwise.
  const list = feed.items.length || feed.loadingFirst ? feed.items.map((i) => i.story) : page.stories.filter((s) => matches(s, query));

  return shell(<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-w-0 space-y-6">
      <BackButton />
      <PersonHeader page={page} actions={<PersonActions page={page} person={person} onReport={() => setReporting(true)} />} />
      {page.relationship?.muted && <p className="flex items-center gap-2 rounded-lg border-2 border-foreground bg-muted px-4 py-3 text-sm font-semibold"><VolumeX className="size-4 shrink-0" />You've muted {name}. Their stories stay out of your feed; you can still read them here.</p>}

      {/* Phones/tablets: this person's stats as a swipeable strip (desktop shows them on the right). */}
      <section className="xl:hidden"><p className="mb-3 text-xs font-bold uppercase text-primary">Swipe for their stats</p><PersonRail stats={page.stats} name={name} layout="strip" /></section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase text-primary">Their receipts</p><h2 className="text-2xl font-bold">{query ? `Results for “${query}”` : `Stories by ${name}`}</h2></div><span className="text-xs font-semibold text-muted-foreground">{page.stats.stories} {page.stats.stories === 1 ? "story" : "stories"}</span></div>
        {list.length === 0 && !feed.loadingFirst
          ? <div className="rounded-xl border-2 border-dashed border-foreground/40 p-10 text-center"><p className="font-display text-xl font-bold">{query ? "Nothing matches" : "No stories yet"}</p><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{query ? "Try another search." : page.profile.isMe ? "Your first story could save someone six rounds and a surprise take-home." : `When ${name} shares a story, it'll show up here.`}</p>{page.profile.isMe && !query && <Button className="mt-5" onClick={() => setShare(true)}>Share your first story</Button>}</div>
          : <div className="space-y-4">
              {list.map((s) => <FeedStory key={s.id} story={s} saved={saved.has(s.id)} onSave={() => toggleSave(s.id)} onOpenCompany={setCompany} />)}
              <div ref={sentinel} aria-hidden="true" />
            </div>}
      </section>
    </div>
    <div data-lenis-prevent className="hidden xl:sticky xl:top-[5.5rem] xl:block xl:max-h-[calc(100vh-6.5rem)] xl:self-start xl:overflow-y-auto xl:overflow-x-hidden xl:overscroll-contain xl:pb-2 xl:pr-2 no-scrollbar"><PersonRail stats={page.stats} name={name} /></div>
    <ReportPersonDialog open={reporting} onOpenChange={setReporting} name={name} onSubmit={person.report} />
  </div>);
}
