import Link from "next/link";
import { addDays, istMonday } from "@/lib/dates";
import { ThemeToggle } from "./theme-toggle";

// App frame: left sidebar (collapses to a top bar on phones), top status bar, content area.

type NavKey = "dashboard" | "week" | "archive" | "runs" | "settings";

const NAV: { key: NavKey; href: string; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", href: "/", label: "Dashboard", icon: <IconGrid /> },
  { key: "week", href: "/?tab=week", label: "This week", icon: <IconPulse /> },
  { key: "archive", href: "/archive", label: "Archive", icon: <IconArchive /> },
  { key: "runs", href: "/runs", label: "Run log", icon: <IconList /> },
  { key: "settings", href: "/settings", label: "Settings", icon: <IconGear /> },
];

export function AppShell({ active, status, children }: { active: NavKey; status?: string; children: React.ReactNode }) {
  const nextMonday = addDays(istMonday(new Date()), 7);
  const nextLabel = new Date(`${nextMonday}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] gap-0 lg:gap-5 lg:p-5">
      <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-60 shrink-0 flex-col rounded-2xl border border-line bg-panel/80 p-4 backdrop-blur lg:flex">
        <Brand />
        <nav className="mt-6 flex flex-col gap-1">
          {NAV.map((n) => (
            <Link key={n.key} href={n.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active === n.key ? "bg-panel2 text-fg ring-1 ring-inset ring-line" : "text-muted hover:bg-fg/5 hover:text-fg"}`}>
              <span className={active === n.key ? "text-violet" : ""}>{n.icon}</span>{n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-line bg-gradient-to-b from-violet/15 to-transparent p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg accent-gradient text-white"><IconMail /></div>
          <p className="mt-3 text-sm font-semibold text-fg">Next brief</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{nextLabel}, 5:30 AM IST · emailed before you record</p>
          <Link href="/settings" className="mt-3 flex items-center justify-center gap-2 rounded-lg accent-gradient px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-violet/20">
            Run now in Settings
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone/tablet: compact top bar instead of the sidebar */}
        <div className="flex items-center justify-between gap-3 border-b border-line bg-panel/80 px-4 py-3 backdrop-blur lg:hidden">
          <Brand />
          <ThemeToggle />
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 lg:hidden">
          {NAV.map((n) => (
            <Link key={n.key} href={n.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${active === n.key ? "bg-panel2 text-fg" : "text-muted"}`}>{n.label}</Link>
          ))}
        </nav>

        <header className="hidden items-center justify-between gap-4 rounded-2xl border border-line bg-panel/80 px-5 py-3 backdrop-blur lg:flex">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-mint" /></span>
            {status ?? "Live data from 15 podcast feeds"}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a href="https://github.com/ichhajain-hub/podcast-radar" target="_blank" rel="noreferrer" className="rounded-lg border border-line p-2 text-muted hover:text-fg" title="GitHub repository"><IconCode /></a>
            <div className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full accent-gradient text-xs font-bold text-white">A</span>
              <div className="leading-tight"><div className="text-sm font-medium text-fg">Aditya</div><div className="text-[11px] text-dim">Host · Founders podcast</div></div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-1 lg:py-6">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg accent-gradient text-white shadow-lg shadow-violet/30"><IconRadar /></span>
      <span className="font-semibold tracking-tight text-fg">Podcast Radar</span>
    </Link>
  );
}

const s = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function IconRadar() { return <svg {...s} width={16} height={16} strokeWidth={2.2}><path d="M4 12a8 8 0 0 1 8-8" /><path d="M7.5 12A4.5 4.5 0 0 1 12 7.5" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></svg>; }
function IconGrid() { return <svg {...s}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>; }
function IconPulse() { return <svg {...s}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>; }
function IconArchive() { return <svg {...s}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg>; }
function IconList() { return <svg {...s}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>; }
function IconGear() { return <svg {...s}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>; }
function IconMail() { return <svg {...s} width={16} height={16}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>; }
function IconCode() { return <svg {...s} width={16} height={16}><path d="m8 6-6 6 6 6M16 6l6 6-6 6" /></svg>; }
