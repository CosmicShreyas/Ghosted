// Animated icons from lucide-animated (https://lucide-animated.com), installed with the shadcn CLI.
// Each icon has its own purpose-made motion (the bell rings, the gear turns, the pen writes).
// Add more with: npx shadcn@latest add "https://lucide-animated.com/r/<icon-name>.json"
// (they land in src/components/ui; move them here).
import { useRef } from "react";

export { BellIcon } from "./bell";
export { BookmarkIcon } from "./bookmark";
export { ChartLineIcon } from "./chart-line";
export { FlameIcon } from "./flame";
export { HeartIcon } from "./heart";
export { HomeIcon } from "./home";
export { LogoutIcon } from "./logout";
export { MenuIcon } from "./menu";
export { MessageCircleIcon } from "./message-circle";
export { SearchIcon } from "./search";
export { SettingsIcon } from "./settings";
export { ShieldCheckIcon } from "./shield-check";
export { SparklesIcon } from "./sparkles";
export { SquarePenIcon } from "./square-pen";
export { TrendingDownIcon } from "./trending-down";
export { UserIcon } from "./user";
export { WalletIcon } from "./wallet";
export { XIcon } from "./x";

export type IconHandle = { startAnimation: () => void; stopAnimation: () => void };

// Plays an icon's animation when its whole parent (button, row, input) is hovered or focused,
// not just the small icon itself. Spread `trigger` onto the parent and pass `ref` to the icon.
export function useIconAnimation<T extends IconHandle = IconHandle>() {
  const ref = useRef<T>(null);
  const start = () => ref.current?.startAnimation();
  const stop = () => ref.current?.stopAnimation();
  return { ref, start, stop, trigger: { onMouseEnter: start, onMouseLeave: stop, onFocus: start, onBlur: stop } };
}
