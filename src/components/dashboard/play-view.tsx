// Dashboard → Play: a picker of games. Ghost Blasters (with its leaderboard beside it, below on
// phones) plus three quick hiring games (components/play-games.tsx). Each game's code only loads
// when it's opened.
import { lazy, Suspense, useState } from "react";
import { SlidingPill, usePill } from "@/components/sliding-pill";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { Avatar } from "@/components/ghosted";
import { api, apiEnabled } from "@/lib/api";
import { useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";
import { card } from "./ui-kit";

const GhostBlastersGame = lazy(() => import("@/components/ghost-blasters").then((m) => ({ default: m.GhostBlastersGame })));
const PlayGame = lazy(() => import("@/components/play-games").then((m) => ({ default: m.PlayGame })));

type Entry = { rank: number; handle: string; avatarSeed: string; pastel: string; xp: number; level: number; offers: number };

function Leaderboard() {
  const tone = useTone();
  const board = useQuery({ queryKey: ["game", "board"], queryFn: () => api<{ entries: Entry[] }>("/v1/game/leaderboard"), enabled: apiEnabled, staleTime: 60_000 });
  const mine = useQuery({ queryKey: ["game", "me"], queryFn: () => api<{ signedIn: boolean; best: number | null; rank: number | null }>("/v1/game/me"), enabled: apiEnabled, staleTime: 60_000 });
  const entries = board.data?.entries ?? [];
  return <aside className={cn(card, "flex flex-col p-4")}>
    <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Trophy className="size-5 text-flag-amber" />Leaderboard</h2>
    <p className="text-xs text-muted-foreground">Best runs, anonymous handles only. Just for fun.</p>
    {!apiEnabled ? <p className="mt-4 text-sm text-muted-foreground">The leaderboard appears on the live site.</p>
      : board.isPending ? <div className="mt-4 space-y-2" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
      : board.isError ? <p className="mt-4 text-sm text-muted-foreground">Couldn't load the leaderboard right now.</p>
      : entries.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">{voice(tone, "Nobody's on the board yet. The top spot is unclaimed, like most job offers.", "No scores yet. Play a run to take the first spot.")}</p>
      : <ol className="mt-3 space-y-1.5">{entries.map((e) => <li key={e.rank} className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5", e.rank <= 3 && "bg-accent/60")}>
          <span className={cn("w-6 text-center font-display text-sm font-bold tabular-nums", e.rank === 1 ? "text-flag-amber" : "text-muted-foreground")}>{e.rank}</span>
          <Avatar seed={e.avatarSeed} pastel={e.pastel} size="sm" label={e.handle} />
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{e.handle}</span>
          <span className="text-right"><span className="block font-display text-sm font-bold tabular-nums">{e.xp.toLocaleString("en-IN")}</span><span className="block text-[10px] text-muted-foreground">Level {e.level}</span></span>
        </li>)}</ol>}
    {mine.data?.signedIn && <p className="mt-auto border-t-2 border-foreground/15 pt-3 text-xs font-semibold">
      {mine.data.best != null ? <>Your best: <b className="tabular-nums">{mine.data.best.toLocaleString("en-IN")}</b> · Rank <b className="tabular-nums">#{mine.data.rank}</b></> : "Finish a run to get on the board."}
    </p>}
  </aside>;
}

const GAMES = [
  { id: "blasters", label: "Ghost Blasters", blurb: ["Waiting on a reply? Blast the bad hiring practices while you wait. Offers from Green Flag Recruiters earn Experience.", "A short arcade break. Collect offers from Green Flag Recruiters to earn Experience."] },
  { id: "catcher", label: "Offer Catcher", blurb: ["Offers are raining. So are red flags. Catch the right ones in your inbox.", "Catch offer letters, dodge red flags. Three lives."] },
  { id: "flight", label: "Follow-Up Flight", blurb: ["Your follow-up email, versus the walls of silence. Keep it flying.", "Fly your follow-up through the gaps. Tap to flap."] },
  { id: "dash", label: "Notice Period Dash", blurb: ["Run your notice period. Jump the take-homes, duck the Ghosters.", "An endless runner: jump obstacles, duck Ghosters, collect offers."] },
] as const;
type GameId = (typeof GAMES)[number]["id"];

export function PlayView() {
  const tone = useTone();
  const [game, setGame] = useState<GameId>("blasters");
  const pill = usePill(game);
  const current = GAMES.find((g) => g.id === game)!;
  const fallback = <div className="skeleton h-[min(72vh,40rem)] min-h-[26rem] rounded-xl border-2 border-foreground" />;
  return <section className="space-y-4">
    <div>
      <h1 className="font-display text-3xl font-bold">Play</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{voice(tone, current.blurb[0], current.blurb[1])}</p>
    </div>
    {/* Game picker: scrolls sideways on phones rather than wrapping into a tall stack. */}
    <div className="-mx-1 overflow-x-auto px-1 pb-1 no-scrollbar-touch">
      <div ref={pill.ref} className="relative flex w-max gap-2" role="tablist" aria-label="Games">
        <SlidingPill pill={pill} className="rounded-full bg-primary" />
        {GAMES.map((g) => <button key={g.id} data-pill={g.id} type="button" role="tab" aria-selected={game === g.id} onClick={() => setGame(g.id)}
          className={cn("relative min-h-10 whitespace-nowrap rounded-full border-2 border-foreground px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", game === g.id ? "text-primary-foreground" : "bg-card hover:bg-muted")}>
          <span className="relative">{g.label}</span>
        </button>)}
      </div>
    </div>
    {game === "blasters"
      ? <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Suspense fallback={fallback}><GhostBlastersGame /></Suspense>
          <Leaderboard />
        </div>
      : <Suspense fallback={fallback}><PlayGame key={game} id={game} /></Suspense>}
  </section>;
}
