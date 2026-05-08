import { useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../context/AuthContext";
import {
  Github,
  ArrowRight,
  ArrowLeft,
  Shield,
  Clock,
  Bot,
  AlertCircle,
  Lock,
  Layers,
  GitPullRequest,
  Brain,
  Zap,
  CheckCircle2,
  Loader2,
} from "lucide-react";

export default function Login() {
  const { login, isAuthenticated, isLoading, isSigningIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-3 sm:px-4 py-6 sm:py-0 relative overflow-hidden">
      <Helmet>
        <title>Sign In — LGTM</title>
        <meta
          name="description"
          content="Sign in to LGTM with your GitHub account to start getting AI-powered code reviews on your pull requests."
        />
      </Helmet>
      {/* Background layers */}
      <div className="absolute inset-0 hero-grid pointer-events-none" />
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[300px] sm:w-[600px] h-[250px] sm:h-[400px] bg-primary/[0.06] rounded-full blur-[120px] sm:blur-[180px] pointer-events-none" />
      <div className="absolute bottom-[-50px] right-[20%] w-[200px] sm:w-[400px] h-[200px] sm:h-[300px] bg-secondary/[0.04] rounded-full blur-[100px] sm:blur-[150px] pointer-events-none" />
      <div className="absolute top-[40%] left-[-100px] w-[200px] sm:w-[300px] h-[200px] sm:h-[300px] bg-accent/[0.03] rounded-full blur-[80px] sm:blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-5xl">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* ══ LEFT — Why LGTM ══ */}
          <div className="hidden lg:block animate-fade-in-up">
            {/* Back to home */}
            <Link
              to="/"
              className="clay-pill inline-flex items-center gap-2 px-4 py-2 mb-8 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to home
            </Link>

            <img
              src="/logo.png"
              alt="LGTM"
              className="w-14 h-14 rounded-full scale-125 mb-6"
            />
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              <span className="block">AI-powered PR reviews</span>
              <span className="block gradient-text-primary">
                in under 3 minutes.
              </span>
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed mb-8 max-w-md">
              Connect your repos, open a PR, and let 6 specialist agents analyze
              security, bugs, performance, and more — all in parallel. A
              synthesizer posts the final verdict on GitHub.
            </p>

            {/* Feature highlights */}
            <div className="space-y-3">
              {[
                {
                  icon: Layers,
                  title: "6 + 1 Agent Architecture",
                  desc: "Security, bugs, perf, readability, best practices, docs + synthesizer",
                  color: "text-primary",
                  bg: "bg-primary/8",
                },
                {
                  icon: Brain,
                  title: "Full Repo Context",
                  desc: "Tree-sitter indexing, dependency graph, conventions — not just the diff",
                  color: "text-secondary",
                  bg: "bg-secondary/8",
                },
                {
                  icon: GitPullRequest,
                  title: "GitHub Native",
                  desc: "Posted as PR reviews with inline code suggestions",
                  color: "text-accent",
                  bg: "bg-accent/8",
                },
                {
                  icon: Lock,
                  title: "Bring Your Own Keys",
                  desc: "OpenAI or Gemini — your keys, your data. Anthropic coming soon.",
                  color: "text-chart-5",
                  bg: "bg-chart-5/8",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="clay-sm p-3.5 flex items-center gap-3.5"
                >
                  <div
                    className={`clay-icon w-9 h-9 flex items-center justify-center ${f.bg} flex-shrink-0`}
                  >
                    <f.icon className={`w-4 h-4 ${f.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{f.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ══ RIGHT — Login card ══ */}
          <div>
            {/* Mobile back button */}
            <div className="lg:hidden mb-4 sm:mb-6 animate-fade-in-up">
              <Link
                to="/"
                className="clay-pill inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Back to home
              </Link>
            </div>

            {/* Logo — mobile only */}
            <div className="text-center mb-4 sm:mb-6 lg:hidden animate-fade-in-up">
              <img
                src="/logo.png"
                alt="LGTM"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full scale-125 mx-auto mb-2 sm:mb-3"
              />
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-1">
                LGTM
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Looks Good To Meow
              </p>
            </div>

            <div
              className="clay-xl p-1.5 sm:p-2 animate-fade-in-up-delay-1"
              style={{ borderRadius: "24px" }}
            >
              <div
                className="clay p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6"
                style={{ borderRadius: "18px" }}
              >
                <div className="text-center">
                  <h2 className="text-lg sm:text-xl font-bold mb-1.5 sm:mb-2">
                    Welcome back
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Sign in with GitHub to access your dashboard and start
                    reviewing PRs with AI.
                  </p>
                </div>

                {/* Error message */}
                {error && (
                  <div
                    className="clay-pressed p-3 flex items-center gap-2.5"
                    style={{ borderRadius: "14px" }}
                  >
                    <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                    <p className="text-xs text-destructive">
                      {error === "missing_code"
                        ? "GitHub authorization was cancelled."
                        : error === "token_exchange"
                          ? "Failed to authenticate with GitHub. Try again."
                          : "Something went wrong. Please try again."}
                    </p>
                  </div>
                )}

                {/* GitHub sign-in button */}
                <button
                  onClick={login}
                  disabled={isSigningIn}
                  className="clay-btn clay-btn-primary w-full px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base flex items-center justify-center gap-2 sm:gap-3"
                >
                  {isSigningIn ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Github className="w-5 h-5" />
                  )}
                  {isSigningIn
                    ? "Redirecting to GitHub..."
                    : "Sign in with GitHub"}
                  {!isSigningIn && <ArrowRight className="w-4 h-4" />}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">
                    what you get
                  </span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                </div>

                {/* Trust signals */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {[
                    { icon: Shield, label: "OWASP Top 10", value: "Security" },
                    { icon: Clock, label: "< 3 min", value: "Reviews" },
                    { icon: Bot, label: "6 agents", value: "+ synthesizer" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="clay-pressed p-2 sm:p-3 text-center"
                      style={{ borderRadius: "12px" }}
                    >
                      <item.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary mx-auto mb-1 sm:mb-1.5" />
                      <p className="text-[10px] sm:text-xs font-bold">
                        {item.label}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* How it works mini */}
                <div
                  className="clay-pressed p-3 sm:p-4"
                  style={{ borderRadius: "14px" }}
                >
                  <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2 sm:mb-3">
                    How it works
                  </p>
                  <div className="space-y-2 sm:space-y-2.5">
                    {[
                      { step: "1", text: "Sign in with your GitHub account" },
                      { step: "2", text: "Add your AI provider API key" },
                      {
                        step: "3",
                        text: "Connect a repo — webhooks auto-configured",
                      },
                      {
                        step: "4",
                        text: "Open a PR and get a full review in minutes",
                      },
                    ].map((s) => (
                      <div
                        key={s.step}
                        className="flex items-center gap-2 sm:gap-2.5"
                      >
                        <div className="clay-icon w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center bg-primary/10 flex-shrink-0">
                          <span className="text-[9px] sm:text-[10px] font-bold text-primary">
                            {s.step}
                          </span>
                        </div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {s.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scopes note */}
                <div className="flex items-center justify-center gap-2 text-muted-foreground/40">
                  <Lock className="w-3 h-3" />
                  <p className="text-[10px]">
                    GitHub App permissions. Your API keys stay with you.
                  </p>
                </div>
              </div>
            </div>

            {/* Trusted by line */}
            <div className="text-center mt-4 sm:mt-5 animate-fade-in-up-delay-2">
              <div className="flex items-center justify-center gap-3 sm:gap-4 flex-wrap text-muted-foreground/30">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3" />
                  <span className="text-[9px] sm:text-[10px]">Fast setup</span>
                </div>
                <div className="w-px h-3 bg-border/30 hidden sm:block" />
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="text-[9px] sm:text-[10px]">
                    Free tier available
                  </span>
                </div>
                <div className="w-px h-3 bg-border/30 hidden sm:block" />
                <div className="flex items-center gap-1.5">
                  <Github className="w-3 h-3" />
                  <span className="text-[9px] sm:text-[10px]">
                    GitHub native
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
