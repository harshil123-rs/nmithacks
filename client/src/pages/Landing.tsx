import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../context/AuthContext";
import {
  Shield,
  Zap,
  GitPullRequest,
  Bot,
  ArrowRight,
  CheckCircle2,
  Clock,
  Lock,
  FileCode2,
  Gauge,
  BookOpen,
  Brain,
  Github,
  Star,
  BarChart3,
  Eye,
  Bug,
  Code2,
  Layers,
  Settings2,
  Bell,
  Sparkles,
  AlertTriangle,
  MessageSquare,
  LogOut,
  ChevronDown,
  Terminal,
  Package,
  Crown,
  Infinity,
  DollarSign,
} from "lucide-react";

/* ═══════════════════════════════════════════
   NAVBAR
   ═══════════════════════════════════════════ */
function Navbar() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Track scroll position with smooth progress
  useEffect(() => {
    function handleScroll() {
      const scrollY = window.scrollY;
      const maxScroll = 100; // Distance to fully transition
      const progress = Math.min(scrollY / maxScroll, 1);
      setScrollProgress(progress);
    }
    handleScroll(); // Initial call
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Calculate background with opacity
  const bgOpacity = scrollProgress;
  const shadowOpacity = scrollProgress;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3 sm:pt-4">
        <div
          className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 rounded-[18px]"
          style={{
            background: `linear-gradient(145deg, rgba(30, 39, 54, ${bgOpacity}), rgba(23, 29, 40, ${bgOpacity}))`,
            boxShadow:
              shadowOpacity > 0
                ? `5px 5px 14px rgba(0, 0, 0, ${0.5 * shadowOpacity}), -3px -3px 10px rgba(255, 255, 255, ${0.01 * shadowOpacity}), inset 1.5px 1.5px 3px rgba(255, 255, 255, ${0.05 * shadowOpacity}), inset -1.5px -1.5px 3px rgba(0, 0, 0, ${0.35 * shadowOpacity})`
                : "none",
            transition: "box-shadow 0.3s ease-out",
          }}
        >
          <div className="flex items-center gap-2 sm:gap-3">
            <img
              src="/logo.png"
              alt="LGTM"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full scale-125"
            />
            <span className="text-base sm:text-lg font-bold tracking-tight">
              LGTM
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {["Features", "Agents", "How it works", "Pricing"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-xl"
              >
                {item}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <>
                {/* Profile dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-1.5 clay-btn clay-btn-ghost px-1.5 py-1.5 sm:px-2 sm:py-1.5"
                  >
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.username}
                        className="w-7 h-7 rounded-full border border-white/10"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">
                          {user?.username?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <ChevronDown
                      className={`w-3 h-3 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {dropdownOpen && (
                    <div
                      className="absolute right-0 mt-2 w-52 clay p-1.5 z-50"
                      style={{ borderRadius: "16px" }}
                    >
                      {/* User info */}
                      <div className="px-3 py-2.5 border-b border-white/[0.04]">
                        <p className="text-sm font-semibold truncate">
                          {user?.username}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {user?.email || "No email"}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setDropdownOpen(false);
                            navigate("/dashboard");
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.03] rounded-xl transition-colors"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          Dashboard
                        </button>
                        <button
                          onClick={async () => {
                            setDropdownOpen(false);
                            await logout();
                            navigate("/");
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-destructive/80 hover:text-destructive hover:bg-destructive/[0.05] rounded-xl transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate("/login")}
                  className="clay-btn clay-btn-ghost px-4 sm:px-5 py-2 sm:py-2.5 text-sm hidden sm:flex items-center gap-2"
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate("/login")}
                  className="clay-btn clay-btn-primary px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2"
                >
                  <Github className="w-4 h-4" />
                  <span className="hidden sm:inline">Get started</span>
                  <span className="sm:hidden">Start</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════ */
function Hero() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative pt-20 sm:pt-28 lg:pt-24 pb-6 sm:pb-12 lg:pb-16 px-3 sm:px-6 overflow-hidden">
      {/* ── Background layers ── */}
      <div className="absolute inset-0 hero-grid pointer-events-none" />
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[400px] sm:w-[700px] lg:w-[900px] h-[300px] sm:h-[500px] lg:h-[600px] bg-primary/[0.06] rounded-full blur-[120px] sm:blur-[180px] lg:blur-[200px] pointer-events-none" />
      <div className="absolute top-[30%] right-0 w-[200px] sm:w-[400px] lg:w-[500px] h-[200px] sm:h-[400px] lg:h-[500px] bg-secondary/[0.04] rounded-full blur-[100px] sm:blur-[150px] lg:blur-[180px] pointer-events-none" />
      <div className="absolute bottom-0 left-[10%] w-[150px] sm:w-[300px] lg:w-[400px] h-[150px] sm:h-[300px] lg:h-[400px] bg-accent/[0.03] rounded-full blur-[80px] sm:blur-[120px] lg:blur-[150px] pointer-events-none" />

      <div className="max-w-7xl mx-auto w-full relative z-10">
        <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-6 items-start lg:items-center">
          {/* ══ LEFT — Copy ══ */}
          <div className="text-center lg:mb-45 lg:text-left max-w-lg mx-auto lg:max-w-none lg:mx-0">
            {/* Pill */}
            <div className="animate-fade-in-up inline-flex items-center gap-2 sm:gap-2.5 clay-pill px-3 sm:px-5 py-1.5 sm:py-2 mb-4 sm:mb-5">
              <img
                src="/logo.png"
                alt="LGTM"
                className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full scale-125"
              />
              <span className="text-[11px] sm:text-sm text-muted-foreground font-medium">
                Looks Good To Meow
              </span>
              <span className="w-px h-3 sm:h-3.5 bg-border" />
              <span className="text-[11px] sm:text-sm text-primary font-medium">
                v1.0.0 — Beta
              </span>
            </div>

            {/* Heading */}
            <h1 className="animate-fade-in-up-delay-1 text-3xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.08] mb-3 sm:mb-4">
              <span className="block">AI code reviews</span>
              <span className="gradient-text-primary">
                that actually understand{" "}
              </span>
              <span className="text-muted-foreground/50 text-[0.6em]">
                your codebase.
              </span>
            </h1>

            {/* Sub */}
            <p className="animate-fade-in-up-delay-2 text-sm sm:text-sm md:text-base text-muted-foreground max-w-md mx-auto lg:mx-0 mb-5 sm:mb-6 leading-relaxed">
              6 specialist agents run in parallel on every PR — security, bugs,
              performance, readability, best practices, and docs. A synthesizer
              weighs all findings and posts the verdict as a GitHub review.
            </p>

            {/* CTAs */}
            <div className="animate-fade-in-up-delay-3 flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 sm:gap-4">
              {isAuthenticated ? (
                <button
                  onClick={() => navigate("/dashboard")}
                  className="clay-btn clay-btn-primary px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-center"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate("/login")}
                    className="clay-btn clay-btn-primary px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-center"
                  >
                    <Github className="w-5 h-5" />
                    <span className="hidden sm:inline">Connect your repos</span>
                    <span className="sm:hidden">Connect your repos</span>
                  </button>
                  <button
                    onClick={() => navigate("/docs")}
                    className="clay-btn clay-btn-ghost px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-center"
                  >
                    <BookOpen className="w-5 h-5 text-muted-foreground" />
                    Read Docs
                  </button>
                </>
              )}
            </div>

            {/* Trust signals */}
            <div className="animate-fade-in-up-delay-4 flex flex-wrap items-center justify-center lg:justify-start gap-3 sm:gap-4 lg:gap-6 mt-5 sm:mt-7"></div>
          </div>

          {/* ══ RIGHT — Immersive terminal visual ══ */}
          <div className="animate-fade-in-up-delay-2 relative lg:max-w-none">
            {/* Glow behind the terminal */}
            <div className="absolute -inset-3 sm:-inset-6 bg-primary/[0.04] rounded-[28px] sm:rounded-[48px] blur-[25px] sm:blur-[40px] pointer-events-none" />

            <div
              className="relative clay-xl p-1 sm:p-1.5 md:p-2"
              style={{ borderRadius: "18px" }}
            >
              {/* Window chrome */}
              <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2.5">
                <div className="flex gap-1 sm:gap-1.5">
                  <div className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full bg-destructive/60" />
                  <div className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full bg-accent/60" />
                  <div className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full bg-chart-5/60" />
                </div>
                <div
                  className="clay-pressed flex-1 mx-1.5 sm:mx-3 px-2 sm:px-3 py-0.5 sm:py-1 flex items-center gap-1.5 sm:gap-2 overflow-hidden"
                  style={{ borderRadius: "8px" }}
                >
                  <Lock className="w-2.5 h-2.5 text-muted-foreground/40 flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground/50 font-mono truncate">
                    app.lgtm.dev/review/pr-42
                  </span>
                </div>
              </div>

              {/* Terminal body */}
              <div
                className="clay p-2.5 sm:p-5 mx-0.5 sm:mx-1 mb-0.5 sm:mb-1 space-y-2 sm:space-y-4"
                style={{ borderRadius: "14px" }}
              >
                {/* PR info row */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="clay-icon w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center bg-primary/10 flex-shrink-0">
                    <GitPullRequest className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] sm:text-sm font-bold truncate">
                      feat: add OAuth login flow
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                      PR #42 into{" "}
                      <span className="text-primary font-mono">main</span>
                    </p>
                  </div>
                  <div className="clay-pill px-2 sm:px-2.5 py-0.5 sm:py-1 flex items-center gap-1 sm:gap-1.5 bg-accent/5 flex-shrink-0">
                    <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-accent" />
                    <span className="text-[9px] sm:text-[10px] font-bold text-accent">
                      Changes
                    </span>
                  </div>
                </div>

                {/* Agent pipeline — the star of the show */}
                <div
                  className="clay-pressed p-2 sm:p-4 space-y-1 sm:space-y-2.5"
                  style={{ borderRadius: "12px" }}
                >
                  <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Agent Pipeline
                    </span>
                    <div className="flex items-center gap-1 sm:gap-1.5">
                      <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-chart-5 animate-pulse" />
                      <span className="text-[9px] sm:text-[10px] font-mono text-chart-5">
                        6/8 complete
                      </span>
                    </div>
                  </div>

                  {/* Agent rows */}
                  {[
                    {
                      icon: FileCode2,
                      name: "Context Indexer",
                      status: "Indexed 847 files via tree-sitter",
                      color: "text-secondary",
                      bg: "bg-secondary/10",
                      done: true,
                    },
                    {
                      icon: Shield,
                      name: "Security",
                      status: "2 critical findings",
                      color: "text-destructive",
                      bg: "bg-destructive/10",
                      done: true,
                    },
                    {
                      icon: Bug,
                      name: "Bugs",
                      status: "1 logic error found",
                      color: "text-accent",
                      bg: "bg-accent/10",
                      done: true,
                    },
                    {
                      icon: Gauge,
                      name: "Performance",
                      status: "1 N+1 query detected",
                      color: "text-secondary",
                      bg: "bg-secondary/10",
                      done: true,
                    },
                    {
                      icon: Eye,
                      name: "Readability",
                      status: "1 suggestion",
                      color: "text-primary",
                      bg: "bg-primary/10",
                      done: true,
                    },
                    {
                      icon: Code2,
                      name: "Best Practices",
                      status: "All good",
                      color: "text-chart-5",
                      bg: "bg-chart-5/10",
                      done: true,
                    },
                    {
                      icon: BookOpen,
                      name: "Documentation",
                      status: "Analyzing...",
                      color: "text-chart-4",
                      bg: "bg-chart-4/10",
                      done: false,
                    },
                    {
                      icon: Brain,
                      name: "Synthesizer",
                      status: "Waiting for agents...",
                      color: "text-accent",
                      bg: "bg-accent/10",
                      done: false,
                    },
                  ].map((agent) => (
                    <div
                      key={agent.name}
                      className={`flex items-center gap-2 sm:gap-2.5 p-1.5 sm:p-2 rounded-xl transition-opacity ${
                        agent.done ? "opacity-100" : "opacity-40"
                      }`}
                    >
                      <div
                        className={`clay-icon w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center ${agent.bg} flex-shrink-0`}
                        style={{ borderRadius: "8px" }}
                      >
                        <agent.icon
                          className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${agent.color} ${!agent.done ? "animate-pulse" : ""}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] sm:text-xs font-semibold">
                          {agent.name}
                        </p>
                        <p className="text-[8px] sm:text-[10px] text-muted-foreground truncate">
                          {agent.status}
                        </p>
                      </div>
                      {agent.done ? (
                        <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-chart-5 flex-shrink-0" />
                      ) : (
                        <div
                          className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border border-muted-foreground/20 flex-shrink-0 animate-spin"
                          style={{
                            borderTopColor: "var(--primary)",
                            animationDuration: "2s",
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Inline comment preview */}
                <div
                  className="clay-sm p-1.5 sm:p-3.5 space-y-1 sm:space-y-2"
                  style={{ borderRadius: "12px" }}
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                    <MessageSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary" />
                    <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Inline Comments
                    </span>
                  </div>
                  {/* Comment 1 */}
                  <div
                    className="clay-pressed p-1.5 sm:p-2.5 flex items-start gap-1.5 sm:gap-2"
                    style={{ borderRadius: "8px" }}
                  >
                    <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[8px] sm:text-[10px] font-mono text-muted-foreground">
                        <span className="text-destructive font-bold">
                          critical
                        </span>{" "}
                        · auth.ts:42
                      </p>
                      <p className="text-[8px] sm:text-[10px] text-muted-foreground/80 mt-0.5 hidden sm:block">
                        SQL injection — use parameterized queries
                      </p>
                    </div>
                  </div>
                  {/* Comment 2 */}
                  <div
                    className="clay-pressed p-1.5 sm:p-2.5 flex items-start gap-1.5 sm:gap-2"
                    style={{ borderRadius: "8px" }}
                  >
                    <Gauge className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-accent mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[8px] sm:text-[10px] font-mono text-muted-foreground">
                        <span className="text-accent font-bold">perf</span> ·
                        user.service.ts:88
                      </p>
                      <p className="text-[8px] sm:text-[10px] text-muted-foreground/80 mt-0.5 hidden sm:block">
                        N+1 query — batch with $in operator
                      </p>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="px-0.5 sm:px-1">
                  <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                    <span className="text-[8px] sm:text-[10px] text-muted-foreground/50 font-mono">
                      Review progress
                    </span>
                    <span className="text-[8px] sm:text-[10px] text-primary font-mono font-bold">
                      57%
                    </span>
                  </div>
                  <div
                    className="clay-pressed h-1 sm:h-1.5 overflow-hidden"
                    style={{ borderRadius: "8px" }}
                  >
                    <div
                      className="h-full rounded-full animate-shimmer"
                      style={{
                        width: "57%",
                        background:
                          "linear-gradient(90deg, #818cf8, #2dd4bf, #818cf8)",
                        backgroundSize: "200% auto",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   REVIEW RESULT — completed review showcase
   The "after" to the hero's "during"
   ═══════════════════════════════════════════ */
function ReviewPreview() {
  return (
    <section className="px-3 sm:px-6 py-16 sm:py-24">
      <div className="max-w-6xl mx-auto">
        {/* Section label */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="clay-pill inline-flex items-center gap-2 px-4 py-1.5 mb-3">
            <CheckCircle2 className="w-3.5 h-3.5 text-chart-5" />
            <span className="text-xs font-semibold text-chart-5 uppercase tracking-wider">
              Review Complete
            </span>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
            Here's what a finished LGTM review looks like — posted directly on
            your PR.
          </p>
        </div>

        <div
          className="clay-xl p-1.5 sm:p-2 md:p-3"
          style={{ borderRadius: "24px" }}
        >
          {/* Window chrome */}
          <div className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-3">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-destructive/60" />
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-accent/60" />
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-chart-5/60" />
            </div>
            <div className="clay-pressed flex-1 mx-2 sm:mx-4 px-3 sm:px-4 py-1.5 flex items-center gap-2 overflow-hidden">
              <Lock className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs text-muted-foreground/60 font-mono truncate">
                github.com/acme/api/pull/42
              </span>
            </div>
          </div>

          {/* Review content */}
          <div
            className="clay p-4 sm:p-6 md:p-8 mx-1 mb-1"
            style={{ borderRadius: "20px" }}
          >
            {/* PR header with verdict */}
            <div className="flex flex-col gap-3 sm:gap-4 mb-6 sm:mb-8">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="clay-icon w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-accent/10 flex-shrink-0">
                  <GitPullRequest className="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-bold leading-tight">
                    feat: add OAuth login flow with JWT refresh
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    PR #42 by{" "}
                    <span className="text-foreground font-medium">
                      @developer
                    </span>{" "}
                    into <span className="font-mono text-primary">main</span>
                    <span className="text-muted-foreground/50 ml-2">
                      · reviewed in 2m 14s
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <div className="clay-pill px-3 sm:px-4 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2 bg-accent/5">
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
                  <span className="text-xs sm:text-sm font-bold text-accent">
                    Request Changes
                  </span>
                </div>
                <div className="clay-pill px-2.5 sm:px-3 py-1.5 sm:py-2">
                  <span className="text-[10px] sm:text-xs font-mono text-muted-foreground">
                    91% confidence
                  </span>
                </div>
                <div className="clay-pill px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-chart-5" />
                  <span className="text-[10px] sm:text-xs font-mono text-chart-5">
                    6 agents + synthesizer done
                  </span>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
              {[
                {
                  label: "Findings",
                  value: "6",
                  icon: AlertTriangle,
                  color: "text-accent",
                },
                {
                  label: "Critical",
                  value: "2",
                  icon: Shield,
                  color: "text-destructive",
                },
                {
                  label: "Files reviewed",
                  value: "14",
                  icon: FileCode2,
                  color: "text-primary",
                },
                {
                  label: "Inline comments",
                  value: "5",
                  icon: MessageSquare,
                  color: "text-secondary",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="clay-pressed p-3 sm:p-4 text-center"
                  style={{ borderRadius: "14px" }}
                >
                  <stat.icon
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${stat.color} mx-auto mb-1.5`}
                  />
                  <p className="text-lg sm:text-2xl font-bold">{stat.value}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Agent results — all complete */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
              <AgentCard
                icon={Shield}
                name="Security"
                color="text-destructive"
                bg="bg-destructive/8"
                findings={2}
                severity="critical"
              />
              <AgentCard
                icon={Bug}
                name="Bugs"
                color="text-accent"
                bg="bg-accent/8"
                findings={1}
                severity="high"
              />
              <AgentCard
                icon={Gauge}
                name="Performance"
                color="text-secondary"
                bg="bg-secondary/8"
                findings={1}
                severity="high"
              />
              <AgentCard
                icon={Eye}
                name="Readability"
                color="text-primary"
                bg="bg-primary/8"
                findings={1}
                severity="medium"
              />
              <AgentCard
                icon={Code2}
                name="Best Practices"
                color="text-chart-5"
                bg="bg-chart-5/8"
                findings={1}
                severity="medium"
              />
              <AgentCard
                icon={BookOpen}
                name="Documentation"
                color="text-chart-4"
                bg="bg-chart-4/8"
                findings={0}
                severity="none"
              />
            </div>

            {/* Final synthesis */}
            <div
              className="clay-pressed p-4 sm:p-5 md:p-6"
              style={{ borderRadius: "16px" }}
            >
              <div className="flex items-center gap-2 sm:gap-2.5 mb-3 sm:mb-4">
                <div className="clay-icon w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-primary/10">
                  <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Final Verdict — Synthesizer
                </span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-3 sm:mb-4">
                2 critical security issues must be fixed before merge. The login
                endpoint at
                <code
                  className="text-primary font-mono text-[10px] sm:text-xs mx-1 clay-pressed px-1.5 sm:px-2 py-0.5 inline-block"
                  style={{ borderRadius: "8px" }}
                >
                  src/routes/auth.ts:42
                </code>
                accepts unsanitized input vulnerable to injection. Token refresh
                logic has no test coverage for edge cases. One N+1 query in the
                user service needs batching. Documentation is up to date.
                Changelog has been auto-drafted.
              </p>

              {/* Inline comments posted */}
              <div className="space-y-1.5 sm:space-y-2">
                <p className="text-[10px] sm:text-xs font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">
                  5 inline comments posted on GitHub
                </p>
                <InlineComment
                  file="auth.ts"
                  line={42}
                  message="SQL injection — use parameterized queries"
                  severity="critical"
                />
                <InlineComment
                  file="auth.ts"
                  line={67}
                  message="JWT secret loaded from env without fallback"
                  severity="critical"
                />
                <InlineComment
                  file="user.service.ts"
                  line={88}
                  message="N+1 query — batch with $in operator"
                  severity="high"
                />
                <InlineComment
                  file="auth.test.ts"
                  line={1}
                  message="Missing tests for refresh token rotation"
                  severity="medium"
                />
                <InlineComment
                  file="auth.controller.ts"
                  line={23}
                  message="Add rate limiting to login endpoint"
                  severity="medium"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AgentCard({
  icon: Icon,
  name,
  color,
  bg,
  findings,
  severity,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  color: string;
  bg: string;
  findings: number | null;
  severity: string;
}) {
  const severityColor =
    {
      critical: "text-destructive",
      high: "text-accent",
      medium: "text-chart-3",
      none: "text-chart-5",
      done: "text-chart-5",
    }[severity] || "text-muted-foreground";

  return (
    <div className="clay-sm p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3.5 transition-all hover:scale-[1.01]">
      <div
        className={`clay-icon w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center ${bg} flex-shrink-0`}
      >
        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm font-semibold">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <CheckCircle2
            className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${severityColor}`}
          />
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {findings !== null
              ? `${findings} finding${findings !== 1 ? "s" : ""}`
              : "Complete"}
          </span>
        </div>
      </div>
    </div>
  );
}

function InlineComment({
  file,
  line,
  message,
  severity,
}: {
  file: string;
  line: number;
  message: string;
  severity: string;
}) {
  const colors =
    {
      critical: "text-destructive border-destructive/20",
      high: "text-accent border-accent/20",
      medium: "text-chart-3 border-chart-3/20",
    }[severity] || "text-muted-foreground border-border";

  return (
    <div
      className={`clay-pill px-3 py-1.5 flex items-center gap-2 text-xs border ${colors}`}
    >
      <MessageSquare className="w-3 h-3 flex-shrink-0" />
      <span className="font-mono">
        {file}:{line}
      </span>
      <span className="text-muted-foreground hidden sm:inline">
        — {message}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TRUST BAR — quick stats
   ═══════════════════════════════════════════ */
function TrustBar() {
  const stats = [
    { icon: Clock, value: "< 3 min", label: "Review time" },
    { icon: Bot, value: "6 + 1", label: "Agents + Synthesizer" },
    { icon: Shield, value: "OWASP", label: "Top 10 covered" },
    { icon: Lock, value: "BYOK", label: "Your keys, your data" },
  ];

  return (
    <section className="px-3 sm:px-6 pb-16 sm:pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="clay-lg p-2 sm:p-3" style={{ borderRadius: "24px" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="clay-pressed p-3 sm:p-5 text-center"
                style={{ borderRadius: "16px" }}
              >
                <s.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary mx-auto mb-2 sm:mb-3" />
                <p className="text-xl sm:text-2xl md:text-3xl font-bold gradient-text-primary">
                  {s.value}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   FEATURES — 2-column layout with big cards
   ═══════════════════════════════════════════ */
function Features() {
  const features = [
    {
      icon: Layers,
      title: "6 + 1 Agent Architecture",
      desc: "Security, bugs, performance, readability, best practices, and documentation agents run in parallel. A synthesizer weighs all findings and posts the final verdict.",
      color: "text-primary",
      bg: "bg-primary/8",
    },
    {
      icon: Brain,
      title: "Full Repo Context",
      desc: "LGTM indexes your codebase with tree-sitter — builds a dependency graph, extracts conventions, and summarizes recent history. Reviews understand your code, not just the diff.",
      color: "text-secondary",
      bg: "bg-secondary/8",
    },
    {
      icon: Zap,
      title: "Under 3 Minutes",
      desc: "All specialist agents run in parallel. From PR opened to review posted with inline comments — faster than your CI.",
      color: "text-accent",
      bg: "bg-accent/8",
    },
    {
      icon: Settings2,
      title: "Bring Your Own Keys",
      desc: "OpenAI or Gemini — add your API keys, pick your model. Override per-repo if you want. Anthropic support coming soon.",
      color: "text-chart-4",
      bg: "bg-chart-4/8",
    },
    {
      icon: GitPullRequest,
      title: "GitHub Native",
      desc: "Reviews posted as PR comments with inline code suggestions. Approve or request changes from the dashboard.",
      color: "text-chart-5",
      bg: "bg-chart-5/8",
    },
    {
      icon: Bell,
      title: "Smart Notifications",
      desc: "In-app and email alerts for completed reviews, AI approvals, and critical security findings.",
      color: "text-destructive",
      bg: "bg-destructive/8",
    },
    {
      icon: Eye,
      title: "Contributor Dashboard",
      desc: "Open a PR on any connected repo and sign in to see all your AI reviews in one place — with verdicts, findings, and confidence scores.",
      color: "text-chart-3",
      bg: "bg-chart-3/8",
    },
  ];

  return (
    <section id="features" className="px-3 sm:px-6 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-6 mb-8 sm:mb-12">
          <div>
            <div className="clay-pill inline-flex items-center gap-2 px-4 py-1.5 mb-3 sm:mb-4">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                Features
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight">
              Everything for
              <br />
              <span className="gradient-text-primary">automated review</span>
            </h2>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md leading-relaxed">
            Deep analysis, not shallow linting. Built for maintainers who want
            reliable first-pass reviews they can trust.
          </p>
        </div>

        {/* Feature grid — 2 cols on desktop, asymmetric sizing */}
        <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`clay p-5 sm:p-7 md:p-8 transition-all hover:scale-[1.01] ${
                i === 0 ? "md:row-span-2" : ""
              }`}
            >
              <div
                className={`clay-icon w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${f.bg} mb-4 sm:mb-5`}
              >
                <f.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${f.color}`} />
              </div>
              <h3 className="text-base sm:text-lg font-bold mb-1.5 sm:mb-2">
                {f.title}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {f.desc}
              </p>
              {i === 0 && <PipelineMini />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   PIPELINE MINI — visual inside feature card
   ═══════════════════════════════════════════ */
function PipelineMini() {
  return (
    <div
      className="clay-pressed p-3 sm:p-5 mt-4 sm:mt-6"
      style={{ borderRadius: "16px" }}
    >
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-2">
        {/* Layer 1 */}
        <div className="w-full sm:flex-1">
          <div className="clay-sm p-2.5 sm:p-3 text-center flex sm:flex-col items-center sm:items-center gap-3 sm:gap-0">
            <div className="clay-icon w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-secondary/10 sm:mx-auto sm:mb-2 flex-shrink-0">
              <FileCode2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-secondary" />
            </div>
            <div className="flex sm:flex-col items-center sm:items-center gap-1.5 sm:gap-0">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-wider sm:mb-0.5">
                Layer 1
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Context
              </p>
            </div>
          </div>
        </div>

        {/* Connector */}
        <div className="flex sm:flex-col items-center gap-0.5 flex-shrink-0 py-0.5 sm:py-0 sm:px-1">
          <div className="h-4 w-px sm:h-px sm:w-6 bg-gradient-to-b sm:bg-gradient-to-r from-secondary/50 to-primary/50" />
          <ArrowRight className="w-3 h-3 text-muted-foreground/30 rotate-90 sm:rotate-0" />
        </div>

        {/* Layer 2 */}
        <div className="w-full sm:flex-1">
          <div className="clay-sm p-2.5 sm:p-3 text-center flex sm:flex-col items-center sm:items-center gap-3 sm:gap-0 relative">
            <div className="clay-icon w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-primary/10 sm:mx-auto sm:mb-2 flex-shrink-0">
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
            </div>
            <div className="flex sm:flex-col items-center sm:items-center gap-1.5 sm:gap-0">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider sm:mb-0.5">
                Layer 2
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                6 Specialists
              </p>
            </div>
            {/* Parallel indicator dots */}
            <div className="flex items-center gap-1 sm:mt-1.5 ml-auto sm:ml-0">
              {[
                "bg-destructive/60",
                "bg-accent/60",
                "bg-secondary/60",
                "bg-primary/60",
                "bg-chart-5/60",
                "bg-chart-4/60",
              ].map((c, i) => (
                <div key={i} className={`w-1 h-1 rounded-full ${c}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Connector */}
        <div className="flex sm:flex-col items-center gap-0.5 flex-shrink-0 py-0.5 sm:py-0 sm:px-1">
          <div className="h-4 w-px sm:h-px sm:w-6 bg-gradient-to-b sm:bg-gradient-to-r from-primary/50 to-accent/50" />
          <ArrowRight className="w-3 h-3 text-muted-foreground/30 rotate-90 sm:rotate-0" />
        </div>

        {/* Layer 3 */}
        <div className="w-full sm:flex-1">
          <div
            className="clay-sm p-2.5 sm:p-3 text-center flex sm:flex-col items-center sm:items-center gap-3 sm:gap-0"
            style={{
              boxShadow:
                "5px 5px 14px rgba(0,0,0,0.5), -3px -3px 10px rgba(255,255,255,0.01), inset 1.5px 1.5px 3px rgba(255,255,255,0.05), inset -1.5px -1.5px 3px rgba(0,0,0,0.35), 0 0 20px rgba(129,140,248,0.04)",
            }}
          >
            <div className="clay-icon w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-accent/10 sm:mx-auto sm:mb-2 flex-shrink-0">
              <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
            </div>
            <div className="flex sm:flex-col items-center sm:items-center gap-1.5 sm:gap-0">
              <p className="text-[10px] font-bold text-accent uppercase tracking-wider sm:mb-0.5">
                Layer 3
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Synthesizer
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   AGENT ARCHITECTURE — visual pipeline
   ═══════════════════════════════════════════ */
function AgentArchitecture() {
  const specialists = [
    {
      icon: Shield,
      name: "Security",
      desc: "OWASP Top 10, secrets, injection, XSS, SSRF",
      color: "text-destructive",
      bg: "bg-destructive/8",
    },
    {
      icon: Bug,
      name: "Bugs",
      desc: "Logic errors, null refs, race conditions",
      color: "text-accent",
      bg: "bg-accent/8",
    },
    {
      icon: Gauge,
      name: "Performance",
      desc: "N+1 queries, complexity, re-renders",
      color: "text-secondary",
      bg: "bg-secondary/8",
    },
    {
      icon: Eye,
      name: "Readability",
      desc: "Naming, structure, complexity, clarity",
      color: "text-primary",
      bg: "bg-primary/8",
    },
    {
      icon: Code2,
      name: "Best Practices",
      desc: "Patterns, error handling, conventions",
      color: "text-chart-5",
      bg: "bg-chart-5/8",
    },
    {
      icon: BookOpen,
      name: "Documentation",
      desc: "Missing docs, outdated comments, JSDoc",
      color: "text-chart-4",
      bg: "bg-chart-4/8",
    },
  ];

  return (
    <section id="agents" className="px-3 sm:px-6 py-16 sm:py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.015] to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-10 sm:mb-16">
          <div className="clay-pill inline-flex items-center gap-2 px-4 py-1.5 mb-3 sm:mb-4">
            <Bot className="w-3.5 h-3.5 text-secondary" />
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Architecture
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mb-3 sm:mb-4">
            6 specialists. 1 synthesizer.
            <br />
            <span className="gradient-text-primary">
              One senior-level review.
            </span>
          </h2>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto px-2">
            Each agent is a specialist. They run in parallel, then a synthesizer
            weighs all findings and posts the final verdict — like a senior
            engineer would.
          </p>
        </div>

        {/* Pipeline visualization */}
        <div className="space-y-4 sm:space-y-6">
          {/* Layer 1 — Context */}
          <div>
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3 ml-1 sm:ml-2">
              <div className="clay-pill px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-bold text-secondary">
                Layer 1
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                Runs on push to main
              </span>
            </div>
            <div
              className="clay-lg p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-5"
              style={{ borderRadius: "24px" }}
            >
              <div className="clay-icon w-11 h-11 sm:w-14 sm:h-14 flex items-center justify-center bg-secondary/10 flex-shrink-0">
                <FileCode2 className="w-5 h-5 sm:w-7 sm:h-7 text-secondary" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold">
                  Context Indexer
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                  Parses your repo with tree-sitter across 12 languages, builds
                  a dependency graph with PageRank, extracts coding conventions,
                  and summarizes recent PR history. Runs on every push to your
                  default branch.
                </p>
              </div>
            </div>
          </div>

          {/* Connector */}
          <div className="flex justify-center">
            <div className="w-px h-6 sm:h-8 bg-gradient-to-b from-secondary/40 to-primary/40" />
          </div>

          {/* Layer 2 — Specialists */}
          <div>
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3 ml-1 sm:ml-2">
              <div className="clay-pill px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-bold text-primary">
                Layer 2
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                6 specialists in parallel on every PR
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {specialists.map((a) => (
                <div
                  key={a.name}
                  className="clay-sm p-3.5 sm:p-5 hover:scale-[1.01] transition-transform"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
                    <div
                      className={`clay-icon w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center ${a.bg}`}
                    >
                      <a.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${a.color}`} />
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold">{a.name}</h4>
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
                    {a.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Connector */}
          <div className="flex justify-center">
            <div className="w-px h-6 sm:h-8 bg-gradient-to-b from-primary/40 to-accent/40" />
          </div>

          {/* Layer 3 — Synthesizer */}
          <div>
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3 ml-1 sm:ml-2">
              <div className="clay-pill px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-bold text-accent">
                Layer 3
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                Synthesizer after all specialists complete
              </span>
            </div>
            <div
              className="clay-lg p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-5"
              style={{
                borderRadius: "24px",
                boxShadow:
                  "12px 12px 30px rgba(0,0,0,0.7), -6px -6px 20px rgba(255,255,255,0.02), inset 3px 3px 6px rgba(255,255,255,0.07), inset -3px -3px 6px rgba(0,0,0,0.45), 0 0 40px rgba(129,140,248,0.06)",
              }}
            >
              <div className="clay-icon w-11 h-11 sm:w-14 sm:h-14 flex items-center justify-center bg-primary/10 flex-shrink-0">
                <Brain className="w-5 h-5 sm:w-7 sm:h-7 text-primary" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold">Synthesizer</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                  Consumes all 6 reports + repo context. Weighs findings,
                  resolves conflicts, generates a changelog entry, and posts the
                  final verdict with inline comments on your PR.
                  <span className="text-foreground font-medium ml-1">
                    Approve, request changes, or comment.
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   HOW IT WORKS — numbered steps
   ═══════════════════════════════════════════ */
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Connect your repo",
      desc: "Sign in with GitHub, add your AI provider API key, and connect any repo in two clicks. Webhooks installed automatically.",
      icon: Github,
      color: "text-primary",
      bg: "bg-primary/8",
    },
    {
      num: "02",
      title: "Open a pull request",
      desc: "Push code and open a PR as you normally would. LGTM picks it up instantly via webhook — no config, no CLI.",
      icon: GitPullRequest,
      color: "text-secondary",
      bg: "bg-secondary/8",
    },
    {
      num: "03",
      title: "Agents analyze in parallel",
      desc: "Security, bugs, performance, readability, best practices, and documentation agents all run simultaneously with full repo context. Then a synthesizer weighs all findings.",
      icon: Bot,
      color: "text-accent",
      bg: "bg-accent/8",
    },
    {
      num: "04",
      title: "Get your review",
      desc: "A synthesized review is posted as a GitHub comment with inline suggestions. Full report on the LGTM dashboard.",
      icon: CheckCircle2,
      color: "text-chart-5",
      bg: "bg-chart-5/8",
    },
  ];

  return (
    <section id="how-it-works" className="px-3 sm:px-6 py-16 sm:py-24">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10 sm:mb-16">
          <div className="clay-pill inline-flex items-center gap-2 px-4 py-1.5 mb-3 sm:mb-4">
            <Zap className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-semibold text-accent uppercase tracking-wider">
              How it works
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight">
            From PR to review
            <br />
            <span className="gradient-text-accent">in 4 steps</span>
          </h2>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {steps.map((step) => (
            <div
              key={step.num}
              className="clay p-4 sm:p-6 md:p-7 flex items-start gap-3 sm:gap-5 md:gap-6 hover:scale-[1.005] transition-transform"
            >
              <span className="font-mono text-xl sm:text-3xl font-bold text-muted-foreground/20 flex-shrink-0 w-7 sm:w-10">
                {step.num}
              </span>
              <div
                className={`clay-icon w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${step.bg} flex-shrink-0`}
              >
                <step.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${step.color}`} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold mb-0.5 sm:mb-1">
                  {step.title}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   PROVIDERS — AI model support
   ═══════════════════════════════════════════ */
function Providers() {
  const providers = [
    { name: "OpenAI", models: "GPT-4o, o1, o3-mini", icon: Star },
    { name: "Google", models: "Gemini 2.5 Pro, Flash", icon: Star },
    { name: "Anthropic", models: "Coming soon", icon: Star },
  ];

  return (
    <section className="px-3 sm:px-6 py-12 sm:py-16">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">
          Bring your own API key. Pick your model. Override per-repo.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2 sm:gap-3">
          {providers.map((p) => (
            <div
              key={p.name}
              className="clay-sm px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto"
            >
              <div className="clay-icon w-9 h-9 flex items-center justify-center bg-white/[0.03]">
                <p.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.models}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   CLI — terminal-first review
   ═══════════════════════════════════════════ */
function CLIShowcase() {
  const navigate = useNavigate();

  return (
    <section className="px-3 sm:px-6 py-16 sm:py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/[0.015] to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-8 sm:mb-12">
          <div className="clay-pill inline-flex items-center gap-2 px-4 py-1.5 mb-3 sm:mb-4">
            <Terminal className="w-3.5 h-3.5 text-secondary" />
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
              CLI
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mb-3 sm:mb-4">
            Review before you push.
            <br />
            <span className="gradient-text-primary">From your terminal.</span>
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
            Install the LGTM CLI and get AI-powered reviews on local changes —
            staged or unstaged — with real-time agent streaming.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Left — Terminal preview */}
          <div
            className="clay-xl p-1.5 sm:p-2"
            style={{ borderRadius: "20px" }}
          >
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-destructive/60" />
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-accent/60" />
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-chart-5/60" />
              </div>
              <div
                className="clay-pressed flex-1 mx-2 px-3 py-1 flex items-center gap-1.5 overflow-hidden"
                style={{ borderRadius: "8px" }}
              >
                <Terminal className="w-2.5 h-2.5 text-muted-foreground/40 flex-shrink-0" />
                <span className="text-[10px] text-muted-foreground/50 font-mono truncate">
                  ~/projects/my-api
                </span>
              </div>
            </div>

            {/* Terminal body */}
            <div
              className="clay p-3 sm:p-5 mx-0.5 mb-0.5 font-mono text-[9px] sm:text-[10px] leading-relaxed space-y-1"
              style={{ borderRadius: "14px" }}
            >
              <p className="text-muted-foreground/40">
                $ npm install -g @tarin/lgtm-cli
              </p>
              <p className="text-muted-foreground/40">$ lgtm login</p>
              <p className="text-chart-5">✓ Logged in as @developer</p>
              <p className="text-muted-foreground/40 mt-2">
                $ lgtm review --staged
              </p>
              <p className="text-muted-foreground mt-1">
                Reviewing staged changes in{" "}
                <span className="text-foreground">acme/api</span>...
              </p>
              <p className="text-muted-foreground/50 mt-1">Agents running:</p>
              <p>
                <span className="text-chart-5">✓</span> Security{" "}
                <span className="text-chart-5">2 issues</span>{" "}
                <span className="text-muted-foreground/30">(3.2s)</span>
              </p>
              <p>
                <span className="text-chart-5">✓</span> Bugs{" "}
                <span className="text-chart-5">0 issues</span>{" "}
                <span className="text-muted-foreground/30">(2.8s)</span>
              </p>
              <p>
                <span className="text-chart-5">✓</span> Performance{" "}
                <span className="text-chart-5">1 issue</span>{" "}
                <span className="text-muted-foreground/30">(3.5s)</span>
              </p>
              <p>
                <span className="text-chart-5">✓</span> Readability{" "}
                <span className="text-chart-5">0 issues</span>{" "}
                <span className="text-muted-foreground/30">(2.1s)</span>
              </p>
              <p>
                <span className="text-chart-5">✓</span> Best Practices{" "}
                <span className="text-chart-5">1 issue</span>{" "}
                <span className="text-muted-foreground/30">(2.9s)</span>
              </p>
              <p>
                <span className="text-chart-5">✓</span> Synthesizer{" "}
                <span className="text-chart-5">done</span>{" "}
                <span className="text-muted-foreground/30">(4.1s)</span>
              </p>
              <p className="text-muted-foreground/20 mt-1">
                ──────────────────────────────
              </p>
              <p>
                Verdict:{" "}
                <span className="text-accent font-bold">REQUEST CHANGES</span>
              </p>
              <p>Confidence: 87%</p>
              <p className="text-muted-foreground/20">
                ──────────────────────────────
              </p>
              <p className="mt-1">
                Issues: <span className="text-destructive">2 critical</span>{" "}
                <span className="text-accent">1 medium</span>
              </p>
            </div>
          </div>

          {/* Right — Features + install */}
          <div className="flex flex-col gap-3 sm:gap-4">
            {/* Install card */}
            <div className="clay p-4 sm:p-6" style={{ borderRadius: "20px" }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="clay-icon w-9 h-9 flex items-center justify-center bg-secondary/10">
                  <Package className="w-4 h-4 text-secondary" />
                </div>
                <div>
                  <p className="text-sm font-bold">@tarin/lgtm-cli</p>
                  <p className="text-[10px] text-muted-foreground">
                    Available on npm
                  </p>
                </div>
              </div>
              <div
                className="clay-pressed p-3 font-mono text-xs flex items-center gap-2 mb-3"
                style={{ borderRadius: "12px" }}
              >
                <span className="text-muted-foreground/40 select-none">$</span>
                <span className="text-primary">
                  npm install -g @tarin/lgtm-cli
                </span>
              </div>
              <button
                onClick={() => navigate("/docs")}
                className="clay-btn clay-btn-ghost px-4 py-2 text-xs flex items-center gap-2 w-full justify-center"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Read the docs
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Feature pills */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {[
                {
                  icon: Zap,
                  title: "Real-time streaming",
                  desc: "Watch agents work live in your terminal",
                  color: "text-accent",
                  bg: "bg-accent/8",
                },
                {
                  icon: Lock,
                  title: "Secure auth",
                  desc: "GitHub OAuth with auto-refreshing tokens",
                  color: "text-primary",
                  bg: "bg-primary/8",
                },
                {
                  icon: FileCode2,
                  title: "Local diff review",
                  desc: "Review uncommitted or staged changes",
                  color: "text-secondary",
                  bg: "bg-secondary/8",
                },
                {
                  icon: GitPullRequest,
                  title: "PR review",
                  desc: "Trigger reviews for open PRs by number",
                  color: "text-chart-5",
                  bg: "bg-chart-5/8",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="clay-sm p-3 sm:p-4"
                  style={{ borderRadius: "16px" }}
                >
                  <div
                    className={`clay-icon w-8 h-8 flex items-center justify-center ${f.bg} mb-2`}
                  >
                    <f.icon className={`w-4 h-4 ${f.color}`} />
                  </div>
                  <p className="text-[11px] font-bold mb-0.5">{f.title}</p>
                  <p className="text-[9px] text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   PRICING — plans overview
   ═══════════════════════════════════════════ */
function LandingPricing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const isPaymentsLive = import.meta.env.VITE_DODO_ENV === "live";

  const FREE_FEATURES = [
    { icon: GitPullRequest, text: "50 reviews per month" },
    { icon: Bot, text: "6 AI review agents" },
    { icon: Shield, text: "All security checks" },
    { icon: Zap, text: "CLI + Dashboard access" },
  ];

  const PRO_FEATURES = [
    { icon: Infinity, text: "Unlimited reviews" },
    { icon: Bot, text: "Auto-review on PRs" },
    { icon: GitPullRequest, text: "6 AI review agents" },
    { icon: Shield, text: "All security checks" },
    { icon: Zap, text: "CLI + Dashboard access" },
    { icon: Crown, text: "Priority support" },
  ];

  return (
    <section id="pricing" className="px-3 sm:px-6 py-16 sm:py-24">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10 sm:mb-14">
          <div className="clay-pill inline-flex items-center gap-2 px-4 py-1.5 mb-3 sm:mb-4">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              Pricing
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mb-3 sm:mb-4">
            Simple, transparent
            <br />
            <span className="gradient-text-primary">pricing</span>
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
            Start free. Upgrade when you need unlimited reviews and auto-review
            on every PR.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Free Plan */}
          <div
            className="clay p-5 sm:p-7 flex flex-col"
            style={{ borderRadius: "24px" }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="clay-icon w-10 h-10 flex items-center justify-center bg-muted-foreground/8">
                <Zap className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-bold">Free</p>
                <p className="text-[10px] text-muted-foreground">Get started</p>
              </div>
            </div>

            <div className="mb-5">
              <span className="text-3xl sm:text-4xl font-bold">₹0</span>
              <span className="text-sm text-muted-foreground ml-1">/month</span>
            </div>

            <div className="space-y-3 flex-1 mb-6">
              {FREE_FEATURES.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="clay-icon w-7 h-7 flex items-center justify-center bg-muted-foreground/5">
                    <f.icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {f.text}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() =>
                navigate(isAuthenticated ? "/dashboard" : "/login")
              }
              className="clay-btn clay-btn-ghost w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
            >
              {isAuthenticated ? "Go to Dashboard" : "Get Started"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Pro Plan */}
          <div
            className="clay-primary p-5 sm:p-7 flex flex-col relative overflow-hidden"
            style={{ borderRadius: "24px" }}
          >
            <div className="absolute top-4 right-4">
              <span className="clay-pill px-2.5 py-1 text-[9px] font-bold text-white bg-white/10 border-white/20">
                POPULAR
              </span>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="clay-icon w-10 h-10 flex items-center justify-center bg-white/10">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">Pro</p>
                <p className="text-[10px] text-white/60">For serious devs</p>
              </div>
            </div>

            <div className="mb-1">
              <span className="text-3xl sm:text-4xl font-bold text-white">
                ₹399
              </span>
              <span className="text-sm text-white/60 ml-1">/month</span>
            </div>
            <p className="text-[10px] text-white/40 mb-5">or ~399 INR/month</p>

            <div className="space-y-3 flex-1 mb-6">
              {PRO_FEATURES.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/10">
                    <f.icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm text-white/90">{f.text}</span>
                </div>
              ))}
            </div>

            {isPaymentsLive ? (
              <button
                onClick={() =>
                  navigate(isAuthenticated ? "/dashboard/pricing" : "/login")
                }
                className="w-full py-3 rounded-2xl bg-white text-primary-foreground font-bold text-sm hover:bg-white/90 transition-all flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(145deg, #fff, #e8e8ff)",
                  boxShadow:
                    "4px 4px 12px rgba(0,0,0,0.3), inset 1px 1px 2px rgba(255,255,255,0.8)",
                }}
              >
                Upgrade to Pro
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-full py-3 rounded-2xl bg-white/10 text-white/60 font-bold text-sm flex items-center justify-center gap-2 cursor-default">
                <Clock className="w-4 h-4" />
                Coming Soon
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] sm:text-xs text-muted-foreground/50 mt-6">
          BYOK — Bring Your Own API Keys. You only pay for the AI tokens you
          use.
        </p>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   CTA — final call to action
   ═══════════════════════════════════════════ */
function CTA() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <section className="px-3 sm:px-6 py-16 sm:py-24">
      <div className="max-w-4xl mx-auto">
        <div
          className="clay-xl p-6 sm:p-10 md:p-16 text-center relative overflow-hidden"
          style={{ borderRadius: "28px" }}
        >
          {/* Ambient glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-60 sm:w-80 h-32 sm:h-40 bg-primary/10 rounded-full blur-[80px] sm:blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-40 sm:w-60 h-24 sm:h-32 bg-accent/8 rounded-full blur-[60px] sm:blur-[80px] pointer-events-none" />

          <div className="relative z-10">
            <img
              src="/logo.png"
              alt="LGTM"
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-full scale-125 mx-auto mb-5 sm:mb-8"
            />

            {isAuthenticated ? (
              <>
                <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mb-3 sm:mb-4">
                  Ready to review
                  <br />
                  your next PR?
                </h2>
                <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-xl mx-auto mb-6 sm:mb-10 px-2">
                  Head to your dashboard to connect repos and start getting
                  AI-powered reviews.
                </p>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="clay-btn clay-btn-primary px-6 sm:px-10 py-3.5 sm:py-4 text-sm sm:text-base flex items-center gap-2 sm:gap-3 mx-auto"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mb-3 sm:mb-4">
                  Stop waiting days
                  <br />
                  for code reviews
                </h2>
                <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-xl mx-auto mb-6 sm:mb-10 px-2">
                  Connect your first repo in under a minute. Your next PR gets a
                  full AI-powered review automatically.
                </p>
                <button
                  onClick={() => navigate("/login")}
                  className="clay-btn clay-btn-primary px-6 sm:px-10 py-3.5 sm:py-4 text-sm sm:text-base flex items-center gap-2 sm:gap-3 mx-auto"
                >
                  <Github className="w-5 h-5" />
                  <span className="hidden sm:inline">
                    Get started with GitHub
                  </span>
                  <span className="sm:hidden">Get started</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}

            <p className="text-[10px] sm:text-xs text-muted-foreground mt-5 sm:mt-8 flex items-center justify-center gap-1.5 sm:gap-2">
              <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              Your API keys stay with you. Code is read via GitHub API and never
              stored.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════ */
function Footer() {
  const navigate = useNavigate();
  return (
    <footer className="px-3 sm:px-6 py-10 sm:py-16">
      <div className="max-w-7xl mx-auto">
        <div
          className="clay-lg p-5 sm:p-8 md:p-10"
          style={{ borderRadius: "24px" }}
        >
          <div className="flex flex-col gap-6 sm:gap-8 items-center">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="LGTM"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full scale-125"
              />
              <div>
                <span className="text-sm sm:text-base font-bold">LGTM</span>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Looks Good To Meow
                </p>
              </div>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-x-6 text-xs sm:text-sm text-muted-foreground">
              <button
                onClick={() => navigate("/docs")}
                className="hover:text-foreground transition-colors"
              >
                Docs
              </button>
              <button
                onClick={() => navigate("/privacy")}
                className="hover:text-foreground transition-colors"
              >
                Privacy
              </button>
              <button
                onClick={() => navigate("/terms")}
                className="hover:text-foreground transition-colors"
              >
                Terms
              </button>
              <button
                onClick={() => navigate("/security")}
                className="hover:text-foreground transition-colors"
              >
                Security
              </button>
              <button
                onClick={() => navigate("/changelog")}
                className="hover:text-foreground transition-colors"
              >
                Changelog
              </button>
            </div>

            {/* Contact */}
            <a
              href="mailto:tarinagarwal@gmail.com"
              className="clay-pill px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              tarinagarwal@gmail.com
            </a>
          </div>

          <div className="mt-5 sm:mt-8 pt-4 sm:pt-6 border-t border-white/[0.04] text-center">
            <p className="text-[10px] sm:text-xs text-muted-foreground/50">
              Built for developers who ship fast and review faster.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════
   LANDING PAGE COMPOSITION
   ═══════════════════════════════════════════ */
export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>LGTM — AI-Powered Code Review for GitHub PRs</title>
        <meta
          name="description"
          content="LGTM (Looks Good To Meow) reviews every GitHub PR with 6 AI agents — security, bugs, performance, readability, best practices, and docs. Context-aware verdicts in under 3 minutes."
        />
      </Helmet>
      <Navbar />
      <Hero />
      <TrustBar />
      <Features />
      <AgentArchitecture />
      <HowItWorks />
      <ReviewPreview />
      <Providers />
      <CLIShowcase />
      <LandingPricing />
      <CTA />
      <Footer />
    </div>
  );
}
