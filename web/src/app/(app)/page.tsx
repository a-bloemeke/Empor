import Link from "next/link"
import { auth } from "@/auth"

export default async function HomePage() {
  const session = await auth()
  const isLoggedIn = !!session?.user

  return (
    <div className="space-y-20 pb-20 -mt-6">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden -mx-4 px-4 py-20 sm:py-28 text-center"
        style={{
          background: "linear-gradient(135deg, oklch(0.20 0.07 150) 0%, oklch(0.35 0.12 150) 50%, oklch(0.22 0.09 160) 100%)",
        }}
      >
        {/* Pitch markings */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
          <line x1="50%" y1="0" x2="50%" y2="100%" stroke="white" strokeWidth="2"/>
          <circle cx="50%" cy="50%" r="100" stroke="white" strokeWidth="2" fill="none"/>
          <circle cx="50%" cy="50%" r="8" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.3"/>
          <ellipse cx="50%" cy="0" rx="120" ry="60" stroke="white" strokeWidth="2" fill="none"/>
          <ellipse cx="50%" cy="100%" rx="120" ry="60" stroke="white" strokeWidth="2" fill="none"/>
          <rect x="35%" y="-2" width="30%" height="80" stroke="white" strokeWidth="1.5" fill="none"/>
          <rect x="35%" y="calc(100% - 78px)" width="30%" height="80" stroke="white" strokeWidth="1.5" fill="none"/>
        </svg>

        <div className="relative space-y-6 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white/80 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Season 2026 is live
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl leading-none">
            Your Football<br />
            <span style={{ color: "oklch(0.78 0.18 145)" }}>Crew App</span>
          </h1>
          <p className="text-lg text-white/70 leading-relaxed">
            Schedule game days, form teams, track every goal and assist,
            and keep season standings — all in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              href={isLoggedIn ? "/schedule" : "/login"}
              className="rounded-lg px-7 py-3 text-sm font-bold transition-all shadow-lg hover:scale-105"
              style={{ background: "oklch(0.60 0.18 150)", color: "white" }}
            >
              {isLoggedIn ? "Open Schedule →" : "Sign in →"}
            </Link>
            <Link
              href="/leaderboard"
              className="rounded-lg border border-white/30 bg-white/10 px-7 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-all backdrop-blur-sm"
            >
              Leaderboard
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats strip ───────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Game Days", value: "weekly" },
          { label: "Team Size", value: "4 to ∞" },
          { label: "Formats", value: "2 or 3 teams" },
          { label: "Records", value: "goals, assists & points" },
        ].map(({ label, value }) => (
          <div key={label}
            className="rounded-xl border border-primary/20 bg-card p-4 text-center shadow-sm"
          >
            <div className="text-xl font-extrabold text-primary">{value}</div>
            <div className="text-xs text-muted-foreground mt-1 font-medium uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-2xl font-extrabold mb-2">Everything your crew needs</h2>
        <p className="text-muted-foreground text-sm mb-8">Built for casual weekly football. No fuss, just football.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: "📅", title: "Game Day Scheduling", body: "Plan your next match with a single tap. Players register themselves until the cutoff — no group-chat chaos." },
            { icon: "🎲", title: "Smart Team Formation", body: "Shuffle teams randomly or build balanced sides based on each player's season rating." },
            { icon: "⚽", title: "Live Scoreboard", body: "Tap to record goals. Open the scoreboard on any screen and watch it update live." },
            { icon: "📊", title: "Season Statistics", body: "Points for won matches, goals, assists and rankings — automatically computed after every game day." },
            { icon: "🏆", title: "Tournament Mode", body: "Three teams? Run a full round-robin tournament with automatic standings and tie-breaking." },
            { icon: "🗓️", title: "Full History", body: "Every game day archived. Export as Excel or JSON at any time." },
          ].map(({ icon, title, body }) => (
            <div key={title}
              className="group relative rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative space-y-2">
                <div className="text-3xl">{icon}</div>
                <h3 className="font-bold text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="rounded-2xl overflow-hidden border border-border shadow-sm">
        {/* Header bar */}
        <div className="px-6 py-4 text-white font-bold text-lg"
          style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
        >
          How a game day works
        </div>
        <div className="divide-y divide-border">
          {[
            { n: "1", icon: "📅", title: "Schedule", body: "The organizer creates a game day. Players register themselves — or the organizer adds them." },
            { n: "2", icon: "🎲", title: "Form teams", body: "Choose random or balanced team formation with one click. Teams are named automatically." },
            { n: "3", icon: "⚽", title: "Play", body: "Start the match. Tap the scoreboard to record goals and assists as the game unfolds." },
            { n: "4", icon: "🏆", title: "End the day", body: "Close the session. Points, goals and assists are tallied and the leaderboard updates." },
          ].map(({ n, icon, title, body }, i) => (
            <div key={n} className={`flex items-start gap-5 px-6 py-5 ${i % 2 === 1 ? "bg-muted/30" : "bg-card"}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold shadow-sm"
                style={{ background: "oklch(0.46 0.16 150)" }}
              >
                {n}
              </div>
              <div>
                <div className="font-semibold text-sm flex items-center gap-2">{icon} {title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl px-8 py-14 text-center text-white shadow-xl"
        style={{ background: "linear-gradient(135deg, oklch(0.22 0.09 150) 0%, oklch(0.40 0.14 155) 100%)" }}
      >
        <div className="absolute inset-0 opacity-5" aria-hidden
          style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div className="relative space-y-4">
          <div className="text-4xl">🏟️</div>
          <h2 className="text-2xl font-extrabold">Ready to kick off?</h2>
          <p className="text-white/70 max-w-md mx-auto text-sm">
            Join your crew, register for the next game day, and start climbing the leaderboard.
          </p>
          <Link
            href={isLoggedIn ? "/schedule" : "/login"}
            className="inline-block rounded-lg px-8 py-3 text-sm font-bold transition-all hover:scale-105 shadow-lg"
            style={{ background: "oklch(0.60 0.18 150)", color: "white" }}
          >
            {isLoggedIn ? "Open Schedule →" : "Sign in →"}
          </Link>
        </div>
      </section>

    </div>
  )
}
