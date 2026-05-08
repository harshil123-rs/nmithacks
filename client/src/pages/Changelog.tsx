import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  Sparkles,
  Bug,
  Zap,
  Shield,
  Package,
  Crown,
} from "lucide-react";

interface ChangelogEntry {
  version: string;
  date: string;
  tag: "launch" | "feature" | "fix" | "improvement";
  title: string;
  items: string[];
}

const TAG_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: any }
> = {
  launch: {
    label: "Launch",
    color: "text-chart-5",
    bg: "bg-chart-5/10",
    icon: Sparkles,
  },
  feature: {
    label: "Feature",
    color: "text-primary",
    bg: "bg-primary/10",
    icon: Package,
  },
  fix: { label: "Fix", color: "text-accent", bg: "bg-accent/10", icon: Bug },
  improvement: {
    label: "Improvement",
    color: "text-secondary",
    bg: "bg-secondary/10",
    icon: Zap,
  },
};

// ── Changelog entries (newest first) ──
// [PLACEHOLDER] Update these entries as you ship new versions
const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "March 20, 2026",
    tag: "launch",
    title: "Initial Launch",
    items: [
      "AI-powered PR reviews with 6 specialist agents (security, bugs, performance, readability, best practices, documentation)",
      "Synthesizer agent that weighs all findings and posts a unified GitHub review",
      "Dashboard with review feed, PR detail, and analytics",
      "Auto-review on new PRs for Pro subscribers",
      "Context indexing with tree-sitter + PageRank for smarter reviews",
      "LGTM CLI (@tarin/lgtm-cli) for reviewing local diffs and GitHub PRs from the terminal",
      "PR Chat — talk to the AI reviewer directly in GitHub PR comments",
      "My PRs page for contributors to see reviews on their pull requests",
      "OpenAI and Google Gemini support (bring your own API key)",
      "Free plan (50 reviews/month) and Pro plan (₹399/month)",
      "Public shareable review reports",
      "Real-time WebSocket updates during reviews",
      "Dodo Payments billing integration",
    ],
  },
];

export default function Changelog() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Changelog — LGTM</title>
        <meta
          name="description"
          content="Release notes and changelog for LGTM (Looks Good To Meow). See what's new in every version."
        />
      </Helmet>
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 flex items-center gap-3 max-w-4xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="clay-btn clay-btn-ghost p-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="LGTM"
            className="w-7 h-7 rounded-full scale-125"
          />
          <span className="text-sm font-bold">LGTM</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div className="clay p-6 sm:p-10 mb-6" style={{ borderRadius: "24px" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="clay-icon w-12 h-12 flex items-center justify-center bg-primary/10">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Changelog</h1>
              <p className="text-xs text-muted-foreground">
                What's new in Looks Good To Meow
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            All notable changes, new features, and fixes. We ship frequently and
            update this page with every release.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-white/[0.06] hidden sm:block" />

          <div className="space-y-6">
            {CHANGELOG.map((entry) => {
              const tag = TAG_CONFIG[entry.tag];
              return (
                <div key={entry.version} className="flex gap-4 sm:gap-5">
                  {/* Timeline dot */}
                  <div className="hidden sm:flex flex-col items-center flex-shrink-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${tag.bg} z-10`}
                    >
                      <tag.icon className={`w-4.5 h-4.5 ${tag.color}`} />
                    </div>
                  </div>

                  {/* Card */}
                  <div
                    className="clay p-5 sm:p-6 flex-1"
                    style={{ borderRadius: "20px" }}
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span
                        className={`clay-pill px-2 py-0.5 text-[9px] font-bold ${tag.color}`}
                      >
                        {tag.label.toUpperCase()}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        v{entry.version}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {entry.date}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold mb-3">{entry.title}</h3>

                    <div className="space-y-1.5">
                      {entry.items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[10px] text-muted-foreground/40 mt-1 flex-shrink-0">
                            +
                          </span>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {item}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer note */}
        <div
          className="clay-pressed p-4 mt-8 text-center"
          style={{ borderRadius: "16px" }}
        >
          <p className="text-[11px] text-muted-foreground/50">
            More updates coming soon. Follow along as we ship.
          </p>
        </div>
      </div>
    </div>
  );
}
