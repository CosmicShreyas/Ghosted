// Charts load on demand. Recharts is the largest library on the site, and it used to ride along on
// every page (even the home page, which has no charts). Wrap a chart's body in <Charts> and use the
// Recharts components it hands you (R.AreaChart, R.XAxis…):
//
//   <div className="h-32"><Charts>{(R) => <R.ResponsiveContainer>…</R.ResponsiveContainer>}</Charts></div>
//
// The first chart on a page fetches the library once; until then a skeleton fills the chart's box,
// which already has a fixed size, so nothing around it moves.
import { useEffect, useState, type ReactNode } from "react";

type Recharts = typeof import("recharts");
let loaded: Recharts | null = null;
let loading: Promise<Recharts> | null = null;
const load = () => (loading ??= import("recharts").then((m) => (loaded = m)));

export function Charts({ children }: { children: (R: Recharts) => ReactNode }) {
  const [R, setR] = useState<Recharts | null>(loaded);
  useEffect(() => { if (!R) void load().then(setR); }, [R]);
  return R ? <>{children(R)}</> : <div className="skeleton size-full min-h-16 rounded-lg" aria-hidden="true" />;
}
