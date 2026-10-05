import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { CookieConsent } from "@/components/cookie-consent";
import { IosInstallHint } from "@/components/ios-install";
import { PushPrompt } from "@/components/push-prompt";
import { LevelWatch } from "@/components/level-watch";
import { Preloader } from "@/components/preloader";
import { useSigningOut, useTone } from "@/lib/session";
import { AnnouncementBar } from "@/components/announcement";
import { SmoothScroll } from "@/components/smooth-scroll";
import { MotionConfig } from "motion/react";
import { usePrefs } from "@/lib/prefs";
import { resyncPush } from "@/lib/push";
import { THEME_BOOT, useApplyTheme, useSyncEmailTheme } from "@/lib/theme";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

// The router hands over whatever was thrown (typed unknown), not necessarily an Error.
function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // viewport-fit=cover lets the app draw under notches and home bars (safe-area padding handles the rest).
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "author", content: "Ghosted" },
      { name: "theme-color", content: "#FAF7F2", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#16111d", media: "(prefers-color-scheme: dark)" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Ghosted" },
      { name: "format-detection", content: "telephone=no" },
      { property: "og:site_name", content: "Ghosted" },
      { property: "og:locale", content: "en_IN" },
      { name: "application-name", content: "Ghosted" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon-light-32x32.png?v=4", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script below sets class/colour-scheme before React loads.
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* Theme first, before any paint: dark mode never flashes white. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <HeadContent />
        {/* Slow-load reveal: entrance animations start hidden (opacity 0) until the app's JavaScript
            takes over. If that hasn't happened within 0.6 s (a phone on a slow network), flag <html>
            so styles.css shows the server-rendered content right away instead of blank sections. */}
        <script dangerouslySetInnerHTML={{ __html: "setTimeout(function(){var d=document.documentElement;if(!d.hasAttribute('data-hydrated'))d.setAttribute('data-slow','')},600)" }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function MotionPrefs({ children }: { children: ReactNode }) {
  const { reduceMotion } = usePrefs();
  useApplyTheme(); // keeps <html class="dark"> in step with Settings and the OS
  useSyncEmailTheme(); // and emails in the same palette
  // Also flags <html> so the CSS rule in styles.css stops CSS animations (marquees, orbits…).
  useEffect(() => { document.documentElement.toggleAttribute("data-reduce-motion", reduceMotion); }, [reduceMotion]);
  // The app is live. After a slow load, keep the early reveal on until the entrance animations have
  // finished underneath it, then hand control back to Motion (so nothing blinks out and back in).
  useEffect(() => {
    const d = document.documentElement;
    d.setAttribute("data-hydrated", "");
    void resyncPush(); // keeps this device's notification address current on the server
    // A tab opened before a deploy asks for page chunks that no longer exist: reload once to get the
    // new version instead of showing a broken page (the flag stops a reload loop).
    const onStale = (e: Event) => {
      try { if (sessionStorage.getItem("ghosted.reloaded")) return; sessionStorage.setItem("ghosted.reloaded", "1"); } catch { /* storage blocked */ }
      e.preventDefault();
      window.location.reload();
    };
    window.addEventListener("vite:preloadError", onStale);
    const clear = window.setTimeout(() => { try { sessionStorage.removeItem("ghosted.reloaded"); } catch { /* storage blocked */ } }, 10_000);
    const t = d.hasAttribute("data-slow") ? window.setTimeout(() => d.removeAttribute("data-slow"), 1500) : undefined;
    return () => { window.clearTimeout(t); window.clearTimeout(clear); window.removeEventListener("vite:preloadError", onStale); };
  }, []);
  return <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>{children}</MotionConfig>;
}

// Covers the whole screen from the moment logout starts until the sign-in page loads, so the old page
// is never seen half-signed-out.
function SigningOutSplash() {
  const on = useSigningOut();
  const tone = useTone();
  if (!on) return null;
  return <div className="fixed inset-0 z-[200] bg-background"><Preloader message={tone === "calm" ? "Signing you out…" : "Signing you out. Ghosting goes both ways…"} /></div>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <SmoothScroll />
      {/* Settings → Appearance → Reduce motion switches off Motion animations site-wide. */}
      <MotionPrefs>
        <AnnouncementBar />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <LevelWatch />
      </MotionPrefs>
      <Toaster position="bottom-right" />
      {/* Asked once; any choice is remembered for a year. Footer → Cookie settings reopens it. */}
      <CookieConsent />
      <IosInstallHint />
      <PushPrompt />
      <SigningOutSplash />
    </QueryClientProvider>
  );
}
