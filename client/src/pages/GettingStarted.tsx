import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Rocket,
  Github,
  FolderGit2,
  KeyRound,
  Play,
  ArrowRight,
  ExternalLink,
  Terminal,
  BookOpen,
  Sparkles,
  Shield,
  Bug,
  Gauge,
  Eye,
  Code2,
  Brain,
} from "lucide-react";

const AGENTS = [
  {
    icon: Shield,
    name: "Security",
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  { icon: Bug, name: "Bugs", color: "text-accent", bg: "bg-accent/10" },
  {
    icon: Gauge,
    name: "Performance",
    color: "text-secondary",
    bg: "bg-secondary/10",
  },
  {
    icon: Eye,
    name: "Readability",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: Code2,
    name: "Best Practices",
    color: "text-chart-5",
    bg: "bg-chart-5/10",
  },
  {
    icon: BookOpen,
    name: "Documentation",
    color: "text-chart-4",
    bg: "bg-chart-4/10",
  },
];

export default function GettingStarted() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="clay-icon w-10 h-10 flex items-center justify-center bg-primary/8">
            <Rocket className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Welcome{user?.username ? `, ${user.username}` : ""}
            </h1>
            <p className="text-sm text-muted-foreground">
              Get your first AI code review in under 5 minutes.
            </p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4 mb-8">
        {/* Step 1: Install GitHub App & Connect Repo */}
        <div className="clay p-5" style={{ borderRadius: "20px" }}>
          <div className="flex items-start gap-4">
            <div className="clay-icon w-10 h-10 flex items-center justify-center flex-shrink-0 bg-primary/10">
              <FolderGit2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider">
                Step 1
              </span>
              <h3 className="text-sm font-bold mb-1">
                Install the GitHub App and connect a repo
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                LGTM needs access to your repositories to review pull requests.
                Install the GitHub App, then connect the repos you want
                reviewed.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href="https://github.com/apps/tarin-lgtm/installations/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="clay-btn clay-btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <Github className="w-3.5 h-3.5" />
                  Install GitHub App
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
                <button
                  onClick={() => navigate("/dashboard/repos")}
                  className="clay-btn clay-btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <FolderGit2 className="w-3.5 h-3.5" />
                  Connect a repo
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Add AI Provider Key */}
        <div className="clay p-5" style={{ borderRadius: "20px" }}>
          <div className="flex items-start gap-4">
            <div className="clay-icon w-10 h-10 flex items-center justify-center flex-shrink-0 bg-accent/10">
              <KeyRound className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider">
                Step 2
              </span>
              <h3 className="text-sm font-bold mb-1">
                Add your AI provider API key
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                LGTM uses your own API key (BYOK). Grab one from OpenAI or
                Google Gemini and add it in settings. You only pay your provider
                for the tokens used.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate("/dashboard/settings")}
                  className="clay-btn clay-btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Go to Settings
                  <ArrowRight className="w-3 h-3" />
                </button>
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="clay-btn clay-btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  Get OpenAI key
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="clay-btn clay-btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  Get Gemini key
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Run First Review */}
        <div className="clay p-5" style={{ borderRadius: "20px" }}>
          <div className="flex items-start gap-4">
            <div className="clay-icon w-10 h-10 flex items-center justify-center flex-shrink-0 bg-chart-5/10">
              <Play className="w-5 h-5 text-chart-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider">
                Step 3
              </span>
              <h3 className="text-sm font-bold mb-1">Run your first review</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                Open a PR on a connected repo and LGTM will review it
                automatically (if auto-review is on). Or trigger a review
                manually from the dashboard or CLI.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate("/dashboard")}
                  className="clay-btn clay-btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  Go to Dashboard
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What happens during a review */}
      <div className="clay p-5 mb-6" style={{ borderRadius: "20px" }}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">What happens during a review</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {AGENTS.map((agent) => (
            <div
              key={agent.name}
              className="clay-pressed p-3 flex items-center gap-2"
              style={{ borderRadius: "14px" }}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${agent.bg} flex-shrink-0`}
              >
                <agent.icon className={`w-3.5 h-3.5 ${agent.color}`} />
              </div>
              <span className="text-xs font-medium">{agent.name}</span>
            </div>
          ))}
        </div>
        <div
          className="flex items-center gap-2 mt-3 clay-pressed p-3"
          style={{ borderRadius: "14px" }}
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10 flex-shrink-0">
            <Brain className="w-3.5 h-3.5 text-accent" />
          </div>
          <div>
            <span className="text-xs font-medium">Synthesizer</span>
            <p className="text-[10px] text-muted-foreground">
              Weighs all findings and posts the final verdict on your PR
            </p>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid sm:grid-cols-2 gap-3">
        <button
          onClick={() => navigate("/docs")}
          className="clay p-4 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
          style={{ borderRadius: "16px" }}
        >
          <div className="clay-icon w-9 h-9 flex items-center justify-center bg-primary/8 flex-shrink-0">
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-bold">Read the docs</p>
            <p className="text-[10px] text-muted-foreground">
              Full setup guide, agent details, and FAQ
            </p>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto flex-shrink-0" />
        </button>

        <div
          className="clay p-4 flex items-center gap-3"
          style={{ borderRadius: "16px" }}
        >
          <div className="clay-icon w-9 h-9 flex items-center justify-center bg-muted-foreground/8 flex-shrink-0">
            <Terminal className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs font-bold">Install the CLI</p>
            <p className="text-[10px] text-muted-foreground font-mono">
              npm i -g @tarin/lgtm-cli
            </p>
          </div>
        </div>
      </div>

      {/* Skip to dashboard */}
      <div className="mt-6 text-center">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Skip to dashboard
        </button>
      </div>
    </div>
  );
}
