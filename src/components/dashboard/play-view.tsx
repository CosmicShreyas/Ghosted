// Dashboard → Play: Ghost Blasters, full size, with the leaderboard beside it (below on phones).
// The game code only loads when this view opens.
import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { Avatar } from "@/components/ghosted";
import { api, apiEnabled } from "@/lib/api";
import { useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";
import { card } from "./ui-kit";

const GhostBlastersGame = lazy(() => import("@/components/ghost-blasters").then((m) => ({ default: m.GhostBlastersGame })));

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

export function PlayView() {
  const tone = useTone();
  return <section className="space-y-4">
    <div>
      <h1 className="font-display text-3xl font-bold">Play</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{voice(tone, "Waiting on a reply? Blast the bad hiring practices while you wait. Offers from Green Flag Recruiters earn Experience.", "A short arcade break. Collect offers from Green Flag Recruiters to earn Experience.")}</p>
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Suspense fallback={<div className="skeleton h-[min(72vh,40rem)] min-h-[26rem] rounded-xl border-2 border-foreground" />}>
        <GhostBlastersGame />
      </Suspense>
      <Leaderboard />
    </div>
  </section>;
}
