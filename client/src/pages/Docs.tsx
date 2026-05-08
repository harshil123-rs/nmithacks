import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  BookOpen,
  Search,
  Rocket,
  Shield,
  Bug,
  Zap,
  Eye,
  Code2,
  FileText,
  Sparkles,
  GitPullRequest,
  Settings,
  Key,
  FolderGit2,
  Cpu,
  Terminal,
  Globe,
  BarChart3,
  Bell,
  Layers,
  Database,
  CheckCircle2,
  Clock,
  FileCode2,
  Workflow,
  Package,
  HelpCircle,
  ChevronDown,
  LayoutDashboard,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Lock,
} from "lucide-react";

// ── Section data ──

const SIDEBAR_SECTIONS = [
  { id: "getting-started", label: "Getting Started", icon: Rocket },
  { id: "agents", label: "Agent Architecture", icon: Cpu },
  { id: "context-indexer", label: "Context Indexer", icon: Database },
  { id: "ai-providers", label: "AI Providers", icon: Sparkles },
  { id: "review-pipeline", label: "Review Pipeline", icon: Workflow },
  { id: "configuration", label: "Configuration", icon: Settings },
  {
    id: "github-integration",
    label: "GitHub Integration",
    icon: GitPullRequest,
  },
  { id: "realtime", label: "Real-time Dashboard", icon: BarChart3 },
  { id: "cli", label: "CLI", icon: Terminal },
  { id: "faq", label: "FAQ", icon: HelpCircle },
] as const;

type SectionId = (typeof SIDEBAR_SECTIONS)[number]["id"];

export default function Docs() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] =
    useState<SectionId>("getting-started");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Scale entire page up 10% via html root font-size (all rem units follow)
  useEffect(() => {
    document.documentElement.style.fontSize = "120%";
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, []);

  const filteredSections = searchQuery
    ? SIDEBAR_SECTIONS.filter((s) =>
        s.label.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : SIDEBAR_SECTIONS;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Helmet>
        <title>Documentation — LGTM</title>
        <meta
          name="description"
          content="LGTM documentation — setup guides, CLI reference, API docs, and configuration for AI-powered code reviews."
        />
      </Helmet>
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen z-50 lg:z-auto flex flex-col transition-all duration-200 ${
          collapsed ? "w-[72px]" : "w-64"
        } ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div
          className="flex-1 clay-lg m-2 p-3 flex flex-col overflow-visible"
          style={{ borderRadius: "20px" }}
        >
          {/* Brand */}
          <div
            className={`flex items-center mb-5 ${collapsed ? "justify-center" : "justify-between"}`}
          >
            {collapsed ? (
              <img
                src="/logo.png"
                alt="LGTM"
                className="w-9 h-9 rounded-full scale-125 cursor-pointer"
                onClick={() => navigate("/")}
              />
            ) : (
              <>
                <div
                  className="flex items-center gap-2.5 cursor-pointer"
                  onClick={() => navigate("/")}
                >
                  <img
                    src="/logo.png"
                    alt="LGTM"
                    className="w-9 h-9 rounded-full scale-125"
                  />
                  <div>
                    <span className="text-base font-bold tracking-tight">
                      LGTM
                    </span>
                    <p className="text-[9px] text-muted-foreground leading-none">
                      Looks Good To Meow
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="lg:hidden p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Search */}
          {!collapsed && (
            <div
              className="clay-pressed p-1 flex items-center gap-2 mb-3"
              style={{ borderRadius: "12px" }}
            >
              <Search className="w-3.5 h-3.5 text-muted-foreground/40 ml-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search docs..."
                className="flex-1 bg-transparent px-1.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/30"
              />
            </div>
          )}

          {/* Doc sections nav */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden min-h-0">
            {filteredSections.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                    setMobileSidebarOpen(false);
                  }}
                  title={collapsed ? section.label : undefined}
                  className={`w-full flex items-center gap-2.5 rounded-xl text-xs transition-all ${
                    collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2"
                  } ${
                    isActive
                      ? "clay-pressed text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
                  }`}
                >
                  <section.icon
                    className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-primary" : ""}`}
                  />
                  {!collapsed && section.label}
                </button>
              );
            })}
          </nav>

          {/* Collapse toggle (desktop) */}
          <div className="hidden lg:block py-3">
            <button
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`w-full flex items-center gap-3 rounded-xl text-sm py-2 text-muted-foreground hover:text-foreground hover:bg-white/[0.02] transition-all ${
                collapsed ? "justify-center px-0" : "px-3"
              }`}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4 flex-shrink-0" />
              ) : (
                <>
                  <PanelLeftClose className="w-4 h-4 flex-shrink-0" />
                  Collapse
                </>
              )}
            </button>
          </div>

          {/* Go to Dashboard */}
          <div className="pt-3 border-t border-white/[0.04]">
            <button
              onClick={() => navigate("/dashboard")}
              title={collapsed ? "Go to Dashboard" : undefined}
              className={`w-full flex items-center gap-2.5 rounded-xl text-xs py-2.5 text-primary hover:bg-primary/[0.05] transition-all ${
                collapsed ? "justify-center px-0" : "px-3"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <span className="font-semibold">Go to Dashboard</span>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div
          className="lg:hidden sticky top-0 z-30 clay-sm mx-2 mt-2 px-3 py-2.5 flex items-center justify-between"
          style={{ borderRadius: "16px" }}
        >
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 text-muted-foreground hover:text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">Docs</span>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="p-1.5 text-primary hover:text-primary/80"
            title="Go to Dashboard"
          >
            <LayoutDashboard className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
          {activeSection === "getting-started" && <GettingStartedSection />}
          {activeSection === "agents" && <AgentsSection />}
          {activeSection === "context-indexer" && <ContextIndexerSection />}
          {activeSection === "ai-providers" && <AIProvidersSection />}
          {activeSection === "review-pipeline" && <ReviewPipelineSection />}
          {activeSection === "configuration" && <ConfigurationSection />}
          {activeSection === "github-integration" && (
            <GitHubIntegrationSection />
          )}
          {activeSection === "realtime" && <RealtimeSection />}
          {activeSection === "cli" && <CLISection />}
          {activeSection === "faq" && <FAQSection />}
        </div>
      </main>
    </div>
  );
}

/* ── Shared components ── */

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: any;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5 mb-1.5">
        <div className="clay-icon w-8 h-8 flex items-center justify-center bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed ml-[42px]">
        {subtitle}
      </p>
    </div>
  );
}

function DocCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`clay p-4 sm:p-5 mb-4 ${className}`}
      style={{ borderRadius: "20px" }}
    >
      {children}
    </div>
  );
}

function StepItem({
  step,
  title,
  description,
  icon: Icon,
}: {
  step: number;
  title: string;
  description: string;
  icon: any;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="clay-icon w-8 h-8 flex items-center justify-center bg-primary/10 flex-shrink-0">
        <span className="text-xs font-bold text-primary">{step}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Icon className="w-3.5 h-3.5 text-primary" />
          <p className="text-sm font-bold">{title}</p>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function InfoPill({
  label,
  value,
  color = "text-primary",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="clay-pressed p-2.5 text-center"
      style={{ borderRadius: "12px" }}
    >
      <p className={`text-sm font-bold ${color}`}>{value}</p>
      <p className="text-[9px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

/* ── Getting Started ── */

function GettingStartedSection() {
  return (
    <div>
      <SectionHeader
        icon={Rocket}
        title="Getting Started"
        subtitle="Set up LGTM in under 5 minutes and get your first AI-powered code review."
      />

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
          Quick Setup
        </p>
        <div className="space-y-4">
          <StepItem
            step={1}
            title="Sign in with GitHub"
            icon={Globe}
            description="Click 'Sign in with GitHub' on the login page. LGTM uses GitHub OAuth to authenticate your account. We only request the permissions needed to read your repos and post reviews."
          />
          <StepItem
            step={2}
            title="Add your AI API key"
            icon={Key}
            description="Go to Settings and add an API key for OpenAI or Google Gemini. This is your own key (BYOK) — LGTM never stores or shares it beyond making review calls on your behalf."
          />
          <StepItem
            step={3}
            title="Connect a repository"
            icon={FolderGit2}
            description="Head to the Repos page and click 'Connect Repo'. Select any repository where the LGTM GitHub App is installed. The app automatically configures webhooks for you."
          />
          <StepItem
            step={4}
            title="Get your first review"
            icon={GitPullRequest}
            description="Open or update a pull request on your connected repo. If auto-review is enabled, LGTM will automatically analyze the PR and post a detailed review with inline comments directly on GitHub."
          />
        </div>
      </DocCard>

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Key Concepts
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="clay-pressed p-3" style={{ borderRadius: "14px" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <Key className="w-3.5 h-3.5 text-accent" />
              <p className="text-xs font-bold">BYOK (Bring Your Own Key)</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              You provide your own API keys for AI providers. Your code is sent
              directly to the AI provider and never stored on our servers beyond
              the review session.
            </p>
          </div>
          <div className="clay-pressed p-3" style={{ borderRadius: "14px" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <Cpu className="w-3.5 h-3.5 text-secondary" />
              <p className="text-xs font-bold">Multi-Agent Review</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Every PR is analyzed by 6 specialist AI agents in parallel, each
              focused on a different aspect. A synthesizer then combines their
              findings into one cohesive review.
            </p>
          </div>
          <div className="clay-pressed p-3" style={{ borderRadius: "14px" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <Database className="w-3.5 h-3.5 text-chart-5" />
              <p className="text-xs font-bold">Context-Aware</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              LGTM indexes your codebase using tree-sitter and PageRank to
              understand your project structure. Reviews include relevant
              context from related files, not just the diff.
            </p>
          </div>
          <div className="clay-pressed p-3" style={{ borderRadius: "14px" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <Bell className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-bold">Real-time Updates</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Watch reviews happen live in the dashboard. Socket-based events
              show each agent's progress, findings, and the final synthesized
              verdict as it happens.
            </p>
          </div>
        </div>
      </DocCard>
    </div>
  );
}

/* ── Agents Section ── */

const AGENTS = [
  {
    id: "security",
    name: "Security Agent",
    icon: Shield,
    color: "text-accent",
    bgColor: "bg-accent/10",
    description:
      "Scans for vulnerabilities, injection risks, authentication flaws, secrets exposure, insecure dependencies, and OWASP Top 10 patterns.",
    checks: [
      "SQL/NoSQL injection vectors",
      "XSS and CSRF vulnerabilities",
      "Hardcoded secrets and API keys",
      "Authentication & authorization flaws",
      "Insecure cryptographic usage",
      "Dependency vulnerabilities",
    ],
  },
  {
    id: "bugs",
    name: "Bug Detection Agent",
    icon: Bug,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    description:
      "Identifies logic errors, null pointer risks, race conditions, off-by-one errors, unhandled edge cases, and type mismatches.",
    checks: [
      "Null/undefined dereferences",
      "Off-by-one and boundary errors",
      "Race conditions & deadlocks",
      "Unhandled promise rejections",
      "Type coercion bugs",
      "Resource leaks",
    ],
  },
  {
    id: "performance",
    name: "Performance Agent",
    icon: Zap,
    color: "text-chart-5",
    bgColor: "bg-chart-5/10",
    description:
      "Detects N+1 queries, memory leaks, unnecessary re-renders, algorithmic inefficiencies, and missing caching opportunities.",
    checks: [
      "N+1 database queries",
      "Memory leaks & unbounded growth",
      "Algorithmic complexity issues",
      "Missing pagination/limits",
      "Unnecessary re-renders (React)",
      "Unoptimized loops & data structures",
    ],
  },
  {
    id: "readability",
    name: "Readability Agent",
    icon: Eye,
    color: "text-primary",
    bgColor: "bg-primary/10",
    description:
      "Evaluates code clarity, naming conventions, function length, nesting depth, and overall maintainability.",
    checks: [
      "Unclear variable/function names",
      "Excessive nesting depth",
      "Functions exceeding reasonable length",
      "Magic numbers and strings",
      "Dead code and unused imports",
      "Inconsistent formatting patterns",
    ],
  },
  {
    id: "best-practices",
    name: "Best Practices Agent",
    icon: Code2,
    color: "text-secondary",
    bgColor: "bg-secondary/10",
    description:
      "Checks adherence to language idioms, framework conventions, SOLID principles, DRY violations, and error handling patterns.",
    checks: [
      "SOLID principle violations",
      "DRY violations (code duplication)",
      "Improper error handling",
      "Missing input validation",
      "Anti-patterns for the language/framework",
      "Incorrect API usage",
    ],
  },
  {
    id: "documentation",
    name: "Documentation Agent",
    icon: FileText,
    color: "text-muted-foreground",
    bgColor: "bg-muted-foreground/10",
    description:
      "Reviews documentation quality, missing JSDoc/docstrings, changelog entries, and whether public APIs are properly documented.",
    checks: [
      "Missing function/class documentation",
      "Outdated or misleading comments",
      "Undocumented public APIs",
      "Missing changelog entries",
      "README accuracy",
      "Type documentation gaps",
    ],
  },
];

function AgentsSection() {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  return (
    <div>
      <SectionHeader
        icon={Cpu}
        title="Agent Architecture"
        subtitle="LGTM uses a multi-agent system: 6 specialist agents analyze your code in parallel, then a synthesizer combines their findings."
      />

      {/* Overview stats */}
      <DocCard>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <InfoPill label="Specialist Agents" value="6" color="text-primary" />
          <InfoPill label="Synthesizer" value="1" color="text-accent" />
          <InfoPill
            label="Timeout per Agent"
            value="90s"
            color="text-muted-foreground"
          />
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          All 6 specialist agents run in parallel for maximum speed. Each agent
          has a 90-second timeout. The synthesizer then weighs all findings by
          severity and confidence to produce a single, cohesive review verdict.
        </p>
      </DocCard>

      {/* Agent cards */}
      <div className="space-y-3">
        {AGENTS.map((agent) => {
          const isExpanded = expandedAgent === agent.id;
          return (
            <DocCard key={agent.id} className="!mb-0">
              <button
                onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`clay-icon w-9 h-9 flex items-center justify-center ${agent.bgColor}`}
                  >
                    <agent.icon className={`w-4.5 h-4.5 ${agent.color}`} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">{agent.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {agent.description.substring(0, 80)}...
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ml-2 ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-white/[0.04]">
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                    {agent.description}
                  </p>
                  <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">
                    What it checks
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {agent.checks.map((check, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[10px] text-muted-foreground"
                      >
                        <CheckCircle2
                          className={`w-3 h-3 ${agent.color} flex-shrink-0`}
                        />
                        {check}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </DocCard>
          );
        })}
      </div>

      {/* Synthesizer */}
      <div className="mt-4">
        <DocCard>
          <div className="flex items-center gap-3 mb-3">
            <div className="clay-icon w-9 h-9 flex items-center justify-center bg-accent/10">
              <Sparkles className="w-4.5 h-4.5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-bold">Synthesizer</p>
              <p className="text-[10px] text-muted-foreground">
                The final decision-maker that combines all agent findings
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
            After all 6 agents complete, the synthesizer receives every finding
            and produces a unified review. It de-duplicates overlapping issues,
            ranks findings by severity, generates inline comments with file/line
            references, and determines the final verdict.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div
              className="clay-pressed p-2.5"
              style={{ borderRadius: "12px" }}
            >
              <p className="text-[10px] font-bold text-chart-5 mb-0.5">
                Approve
              </p>
              <p className="text-[9px] text-muted-foreground">
                No critical or high-severity findings. Code is good to merge.
              </p>
            </div>
            <div
              className="clay-pressed p-2.5"
              style={{ borderRadius: "12px" }}
            >
              <p className="text-[10px] font-bold text-destructive mb-0.5">
                Request Changes
              </p>
              <p className="text-[9px] text-muted-foreground">
                Critical or high-severity issues found that should be addressed
                before merging.
              </p>
            </div>
            <div
              className="clay-pressed p-2.5"
              style={{ borderRadius: "12px" }}
            >
              <p className="text-[10px] font-bold text-accent mb-0.5">
                Comment
              </p>
              <p className="text-[9px] text-muted-foreground">
                Medium/low findings only. Posted as a comment for the author to
                consider.
              </p>
            </div>
          </div>
        </DocCard>
      </div>
    </div>
  );
}

/* ── Context Indexer Section ── */

const SUPPORTED_LANGUAGES = [
  { name: "JavaScript", ext: ".js, .jsx, .mjs, .cjs", color: "text-chart-5" },
  { name: "TypeScript", ext: ".ts, .tsx", color: "text-primary" },
  { name: "Python", ext: ".py", color: "text-accent" },
  { name: "Go", ext: ".go", color: "text-secondary" },
  { name: "Rust", ext: ".rs", color: "text-destructive" },
  { name: "Java", ext: ".java", color: "text-chart-5" },
  { name: "C", ext: ".c, .h", color: "text-muted-foreground" },
  { name: "C++", ext: ".cpp, .cc, .cxx, .hpp", color: "text-primary" },
  { name: "C#", ext: ".cs", color: "text-secondary" },
  { name: "PHP", ext: ".php", color: "text-accent" },
  { name: "Ruby", ext: ".rb", color: "text-destructive" },
  { name: "Kotlin", ext: ".kt, .kts", color: "text-chart-5" },
];

function ContextIndexerSection() {
  return (
    <div>
      <SectionHeader
        icon={Database}
        title="Context Indexer"
        subtitle="Tree-sitter powered codebase analysis with PageRank-based file ranking for intelligent context selection."
      />

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          How It Works
        </p>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="clay-icon w-7 h-7 flex items-center justify-center bg-primary/10 flex-shrink-0">
              <span className="text-[10px] font-bold text-primary">1</span>
            </div>
            <div>
              <p className="text-xs font-bold">Fetch File Tree</p>
              <p className="text-[10px] text-muted-foreground">
                Retrieves the full repository tree from GitHub API. Filters out
                binaries, lock files, node_modules, build artifacts, and files
                over 100KB.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="clay-icon w-7 h-7 flex items-center justify-center bg-primary/10 flex-shrink-0">
              <span className="text-[10px] font-bold text-primary">2</span>
            </div>
            <div>
              <p className="text-xs font-bold">Parse with Tree-sitter</p>
              <p className="text-[10px] text-muted-foreground">
                Each supported file is parsed using language-specific
                tree-sitter grammars. Tag queries (.scm files) extract
                definitions (functions, classes, methods) and references.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="clay-icon w-7 h-7 flex items-center justify-center bg-primary/10 flex-shrink-0">
              <span className="text-[10px] font-bold text-primary">3</span>
            </div>
            <div>
              <p className="text-xs font-bold">Build Dependency Graph</p>
              <p className="text-[10px] text-muted-foreground">
                A directed graph is built where edges go from referencer files
                to definer files. Weights are boosted for well-named identifiers
                (camelCase, snake_case, 8+ chars).
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="clay-icon w-7 h-7 flex items-center justify-center bg-primary/10 flex-shrink-0">
              <span className="text-[10px] font-bold text-primary">4</span>
            </div>
            <div>
              <p className="text-xs font-bold">PageRank Ranking</p>
              <p className="text-[10px] text-muted-foreground">
                Runs PageRank (alpha=0.85, 100 iterations) on the dependency
                graph to rank files by structural importance. During reviews,
                changed files get personalized boosting.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="clay-icon w-7 h-7 flex items-center justify-center bg-primary/10 flex-shrink-0">
              <span className="text-[10px] font-bold text-primary">5</span>
            </div>
            <div>
              <p className="text-xs font-bold">Generate Repo Map</p>
              <p className="text-[10px] text-muted-foreground">
                Produces a compact text map of the most important files and
                their symbols, capped at ~4096 tokens. This map is included in
                every agent's prompt for context.
              </p>
            </div>
          </div>
        </div>
      </DocCard>

      {/* Supported languages */}
      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Supported Languages (12)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <div
              key={lang.name}
              className="clay-pressed p-2.5 flex items-center gap-2"
              style={{ borderRadius: "12px" }}
            >
              <FileCode2
                className={`w-3.5 h-3.5 ${lang.color} flex-shrink-0`}
              />
              <div className="min-w-0">
                <p className="text-[11px] font-bold truncate">{lang.name}</p>
                <p className="text-[9px] text-muted-foreground font-mono truncate">
                  {lang.ext}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DocCard>

      {/* Limits */}
      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Indexer Limits
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <InfoPill label="Max Files" value="3,000" />
          <InfoPill label="Max File Size" value="100KB" />
          <InfoPill label="Batch Size" value="10" />
          <InfoPill label="Map Tokens" value="4,096" />
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed mt-3">
          For monorepos exceeding 3,000 files, the indexer processes the first
          3,000 eligible files. Files are fetched in batches of 10 with a 200ms
          delay between batches to respect GitHub API rate limits.
        </p>
      </DocCard>
    </div>
  );
}

/* ── AI Providers Section ── */

const OPENAI_MODELS = [
  {
    name: "GPT-5.4",
    id: "gpt-5.4",
    input: "$2.50",
    output: "$15.00",
    context: "200K",
    tpm: "500K",
    tier: "Flagship",
  },
  {
    name: "GPT-5.4 Pro",
    id: "gpt-5.4-pro",
    input: "$30.00",
    output: "$180.00",
    context: "200K",
    tpm: "500K",
    tier: "Flagship",
  },
  {
    name: "GPT-5.4 Mini",
    id: "gpt-5.4-mini",
    input: "$0.75",
    output: "$4.50",
    context: "200K",
    tpm: "200K",
    tier: "Efficient",
  },
  {
    name: "GPT-5.4 Nano",
    id: "gpt-5.4-nano",
    input: "$0.20",
    output: "$1.25",
    context: "200K",
    tpm: "200K",
    tier: "Budget",
  },
  {
    name: "GPT-5.3 Codex",
    id: "gpt-5.3-codex",
    input: "$1.75",
    output: "$14.00",
    context: "400K",
    tpm: "500K",
    tier: "Code",
  },
  {
    name: "GPT-5.2",
    id: "gpt-5.2",
    input: "$1.75",
    output: "$14.00",
    context: "200K",
    tpm: "500K",
    tier: "Flagship",
  },
  {
    name: "GPT-4.1 Mini",
    id: "gpt-4.1-mini",
    input: "$0.40",
    output: "$1.60",
    context: "1M",
    tpm: "200K",
    tier: "Stable",
  },
  {
    name: "o4-mini",
    id: "o4-mini",
    input: "$1.10",
    output: "$4.40",
    context: "200K",
    tpm: "200K",
    tier: "Reasoning",
  },
];

const GEMINI_MODELS = [
  {
    name: "Gemini 3.1 Pro",
    id: "gemini-3.1-pro-preview",
    input: "$2.00",
    output: "$12.00",
    context: "200K",
    tpm: "2M",
    tier: "Preview",
  },
  {
    name: "Gemini 3 Flash",
    id: "gemini-3-flash-preview",
    input: "$0.50",
    output: "$3.00",
    context: "1M",
    tpm: "4M",
    tier: "Preview",
  },
  {
    name: "Gemini 2.5 Pro",
    id: "gemini-2.5-pro",
    input: "$1.25",
    output: "$10.00",
    context: "1M",
    tpm: "2M",
    tier: "Stable",
  },
  {
    name: "Gemini 2.5 Flash",
    id: "gemini-2.5-flash",
    input: "$0.30",
    output: "$2.50",
    context: "1M",
    tpm: "4M",
    tier: "Stable",
  },
  {
    name: "Gemini 2.5 Flash Lite",
    id: "gemini-2.5-flash-lite",
    input: "$0.10",
    output: "$0.40",
    context: "1M",
    tpm: "4M",
    tier: "Budget",
  },
];

function AIProvidersSection() {
  const [activeProvider, setActiveProvider] = useState<"openai" | "gemini">(
    "openai",
  );

  return (
    <div>
      <SectionHeader
        icon={Sparkles}
        title="AI Providers"
        subtitle="LGTM supports multiple AI providers with a BYOK (Bring Your Own Key) model. Pricing shown is per 1M tokens."
      />

      {/* Provider tabs */}
      <DocCard>
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setActiveProvider("openai")}
            className={`clay-pill px-4 py-2 text-xs flex items-center gap-2 transition-all ${
              activeProvider === "openai"
                ? "clay-sm text-foreground font-semibold"
                : "text-muted-foreground"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            OpenAI
          </button>
          <button
            onClick={() => setActiveProvider("gemini")}
            className={`clay-pill px-4 py-2 text-xs flex items-center gap-2 transition-all ${
              activeProvider === "gemini"
                ? "clay-sm text-foreground font-semibold"
                : "text-muted-foreground"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Google Gemini
          </button>
          <span className="clay-pill px-4 py-2 text-xs text-muted-foreground/30 flex items-center gap-2 cursor-not-allowed">
            <Sparkles className="w-3.5 h-3.5" />
            Anthropic
            <span className="text-[8px] bg-muted-foreground/10 px-1.5 py-0.5 rounded-full">
              Soon
            </span>
          </span>
        </div>

        {/* Model table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-muted-foreground/50 border-b border-white/[0.04]">
                <th className="text-left py-2 pr-3 font-bold uppercase tracking-wider">
                  Model
                </th>
                <th className="text-left py-2 px-3 font-bold uppercase tracking-wider">
                  Tier
                </th>
                <th className="text-right py-2 px-3 font-bold uppercase tracking-wider">
                  Input
                </th>
                <th className="text-right py-2 px-3 font-bold uppercase tracking-wider">
                  Output
                </th>
                <th className="text-right py-2 pl-3 font-bold uppercase tracking-wider">
                  Context
                </th>
                <th className="text-right py-2 pl-3 font-bold uppercase tracking-wider">
                  TPM
                </th>
              </tr>
            </thead>
            <tbody>
              {(activeProvider === "openai"
                ? OPENAI_MODELS
                : GEMINI_MODELS
              ).map((model) => (
                <tr
                  key={model.id}
                  className="border-b border-white/[0.02] hover:bg-white/[0.01]"
                >
                  <td className="py-2 pr-3">
                    <p className="font-bold text-foreground text-[11px]">
                      {model.name}
                    </p>
                    <p className="text-muted-foreground/50 font-mono">
                      {model.id}
                    </p>
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`clay-pill px-2 py-0.5 text-[8px] font-semibold ${
                        model.tier === "Flagship"
                          ? "text-primary"
                          : model.tier === "Reasoning"
                            ? "text-accent"
                            : model.tier === "Code"
                              ? "text-chart-5"
                              : model.tier === "Preview"
                                ? "text-secondary"
                                : model.tier === "Budget"
                                  ? "text-chart-5"
                                  : "text-muted-foreground"
                      }`}
                    >
                      {model.tier}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-muted-foreground font-mono">
                    {model.input}
                  </td>
                  <td className="py-2 px-3 text-right text-muted-foreground font-mono">
                    {model.output}
                  </td>
                  <td className="py-2 pl-3 text-right text-muted-foreground font-mono">
                    {model.context}
                  </td>
                  <td className="py-2 pl-3 text-right text-primary font-mono">
                    {model.tpm}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocCard>
    </div>
  );
}

/* ── Review Pipeline Section ── */

function ReviewPipelineSection() {
  return (
    <div>
      <SectionHeader
        icon={Workflow}
        title="Review Pipeline"
        subtitle="End-to-end flow from webhook trigger to GitHub PR review."
      />

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
          Pipeline Flow
        </p>
        <div className="space-y-0">
          {[
            {
              icon: Globe,
              title: "Webhook Received",
              desc: "GitHub sends a webhook when a PR is opened, updated, or reopened. LGTM validates the payload and queues a review job.",
              color: "text-muted-foreground",
            },
            {
              icon: FileCode2,
              title: "Diff Parsing",
              desc: "The PR diff is fetched and parsed into structured hunks with file-level additions, deletions, and status. Diffs exceeding 50KB are truncated.",
              color: "text-primary",
            },
            {
              icon: Database,
              title: "Context Building",
              desc: "The repo map is re-ranked with personalized PageRank boosting changed files. Up to 10 related files are fetched along with conventions and recent PR history.",
              color: "text-chart-5",
            },
            {
              icon: Cpu,
              title: "6 Agents (Parallel)",
              desc: "Security, Bugs, Performance, Readability, Best Practices, and Documentation agents all run simultaneously. Each receives the diff, context, conventions, and repo map.",
              color: "text-secondary",
            },
            {
              icon: Sparkles,
              title: "Synthesizer",
              desc: "Combines all agent findings, de-duplicates, ranks by severity, generates inline comments, determines verdict (approve / request_changes / comment), and produces a changelog entry.",
              color: "text-accent",
            },
            {
              icon: GitPullRequest,
              title: "GitHub Review Posted",
              desc: "The final review is posted to GitHub as a PR review with inline comments on specific files and lines. Approved PRs include a note that a maintainer will follow up.",
              color: "text-chart-5",
            },
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 relative">
              {/* Connector line */}
              {i < 5 && (
                <div className="absolute left-[15px] top-[32px] w-px h-[calc(100%-16px)] bg-white/[0.06]" />
              )}
              <div
                className={`clay-icon w-8 h-8 flex items-center justify-center bg-white/[0.03] flex-shrink-0 z-10`}
              >
                <step.icon className={`w-4 h-4 ${step.color}`} />
              </div>
              <div className="flex-1 pb-4">
                <p className="text-xs font-bold mb-0.5">{step.title}</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DocCard>

      {/* Pipeline limits */}
      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Pipeline Limits
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <InfoPill label="Max Diff Size" value="50KB" />
          <InfoPill label="Context Files" value="10" />
          <InfoPill label="Agent Timeout" value="90s" />
          <InfoPill label="Map Tokens" value="4,096" />
        </div>
      </DocCard>

      {/* Verdict logic */}
      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Verdict Logic
        </p>
        <p className="text-[10px] text-muted-foreground leading-relaxed mb-3">
          The synthesizer determines the verdict based on finding severity. A
          smart mapping layer then adjusts the final GitHub review action:
        </p>
        <div className="space-y-2">
          <div
            className="clay-pressed p-3 flex items-start gap-3"
            style={{ borderRadius: "12px" }}
          >
            <CheckCircle2 className="w-4 h-4 text-chart-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-bold text-chart-5">Approve</p>
              <p className="text-[10px] text-muted-foreground">
                No critical or high-severity findings. Posted as an approval
                with a summary.
              </p>
            </div>
          </div>
          <div
            className="clay-pressed p-3 flex items-start gap-3"
            style={{ borderRadius: "12px" }}
          >
            <Shield className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-bold text-destructive">
                Request Changes
              </p>
              <p className="text-[10px] text-muted-foreground">
                Critical or high-severity findings detected. Also triggered when
                the synthesizer returns "comment" but findings include
                critical/high issues.
              </p>
            </div>
          </div>
          <div
            className="clay-pressed p-3 flex items-start gap-3"
            style={{ borderRadius: "12px" }}
          >
            <FileText className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-bold text-accent">Comment</p>
              <p className="text-[10px] text-muted-foreground">
                Only medium, low, or info-level findings. Posted as a comment
                for the author to consider.
              </p>
            </div>
          </div>
        </div>
      </DocCard>
    </div>
  );
}

/* ── Configuration Section ── */

function ConfigurationSection() {
  return (
    <div>
      <SectionHeader
        icon={Settings}
        title="Configuration"
        subtitle="Customize LGTM's behavior per-repo or globally through the dashboard."
      />

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Global Settings (Settings Page)
        </p>
        <div className="space-y-2">
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <Key className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] font-bold">API Keys</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Add API keys for OpenAI and/or Google Gemini. Keys are encrypted
              at rest and only used for making AI calls during reviews. You can
              add multiple providers and switch between them.
            </p>
          </div>
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <p className="text-[11px] font-bold">Default Provider & Model</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Set your default AI provider and model. This is used for all repos
              unless overridden at the repo level. You can change this at any
              time without affecting existing reviews.
            </p>
          </div>
        </div>
      </DocCard>

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Per-Repo Settings (Repos Page)
        </p>
        <div className="space-y-2">
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <GitPullRequest className="w-3.5 h-3.5 text-chart-5" />
              <p className="text-[11px] font-bold">Auto-Review Toggle</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              When enabled, LGTM automatically reviews every new or updated PR
              on this repo. When disabled, you can still trigger manual reviews
              from the dashboard.
            </p>
          </div>
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-3.5 h-3.5 text-secondary" />
              <p className="text-[11px] font-bold">Focus Areas</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Choose which agents run for this repo. Options: Security, Bugs,
              Performance, Readability, Best Practices, Documentation. By
              default all 6 are enabled. Disabling an area skips that agent
              entirely.
            </p>
          </div>
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-3.5 h-3.5 text-accent" />
              <p className="text-[11px] font-bold">AI Provider Override</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Override the default AI provider and model for a specific repo.
              Useful if you want to use a more powerful model for critical repos
              or a cheaper model for less important ones.
            </p>
          </div>
        </div>
      </DocCard>

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Codebase Indexing
        </p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Indexing is triggered manually from the Repos page or automatically
          when code is pushed to the default branch (main). The index includes
          the file tree, symbol definitions, dependency graph, detected
          conventions, and recent PR summaries. Re-indexing replaces the
          previous index entirely.
        </p>
      </DocCard>
    </div>
  );
}

/* ── GitHub Integration Section ── */

function GitHubIntegrationSection() {
  return (
    <div>
      <SectionHeader
        icon={GitPullRequest}
        title="GitHub Integration"
        subtitle="LGTM integrates with GitHub as a GitHub App, not an OAuth App."
      />

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          GitHub App Model
        </p>
        <p className="text-[10px] text-muted-foreground leading-relaxed mb-3">
          LGTM operates as a GitHub App (tarin-lgtm). This provides fine-grained
          permissions, automatic webhook management, and the ability to post
          reviews as a bot account rather than impersonating a user.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-chart-5" />
              <p className="text-[11px] font-bold">Auto-configured Webhooks</p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              When you connect a repo, webhooks are automatically set up. No
              manual configuration needed.
            </p>
          </div>
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-3.5 h-3.5 text-accent" />
              <p className="text-[11px] font-bold">Minimal Permissions</p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Only requests permissions needed: read code, read/write pull
              requests, and read metadata.
            </p>
          </div>
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <GitPullRequest className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] font-bold">Native PR Reviews</p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Reviews are posted as native GitHub PR reviews with inline
              comments on specific lines, not just generic comments.
            </p>
          </div>
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-3.5 h-3.5 text-secondary" />
              <p className="text-[11px] font-bold">Event-driven</p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Listens for pull_request (opened, synchronize, reopened) and push
              events on the default branch for auto-indexing.
            </p>
          </div>
        </div>
      </DocCard>

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Webhook Events
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 text-[10px]">
            <span className="clay-pill px-2 py-0.5 font-mono text-[9px] text-primary">
              pull_request.opened
            </span>
            <span className="text-muted-foreground">
              Triggers auto-review if enabled
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="clay-pill px-2 py-0.5 font-mono text-[9px] text-primary">
              pull_request.synchronize
            </span>
            <span className="text-muted-foreground">
              Re-reviews on new commits pushed to PR
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="clay-pill px-2 py-0.5 font-mono text-[9px] text-primary">
              pull_request.reopened
            </span>
            <span className="text-muted-foreground">
              Triggers review when a closed PR is reopened
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="clay-pill px-2 py-0.5 font-mono text-[9px] text-accent">
              push (default branch)
            </span>
            <span className="text-muted-foreground">
              Triggers automatic codebase re-indexing
            </span>
          </div>
        </div>
      </DocCard>
    </div>
  );
}

/* ── Real-time Dashboard Section ── */

function RealtimeSection() {
  return (
    <div>
      <SectionHeader
        icon={BarChart3}
        title="Real-time Dashboard"
        subtitle="Live updates powered by WebSockets keep you informed as reviews happen."
      />

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Socket Events
        </p>
        <p className="text-[10px] text-muted-foreground leading-relaxed mb-3">
          LGTM uses Socket.IO for real-time communication. When a review starts,
          you can watch each agent's progress live in the PR detail view.
        </p>
        <div className="space-y-1.5">
          {[
            {
              event: "review:started",
              desc: "Review job has been queued and is starting",
              color: "text-primary",
            },
            {
              event: "review:agent:started",
              desc: "A specialist agent has begun analyzing the PR",
              color: "text-secondary",
            },
            {
              event: "review:agent:completed",
              desc: "An agent finished with its findings count",
              color: "text-chart-5",
            },
            {
              event: "review:agent:failed",
              desc: "An agent timed out or encountered an error",
              color: "text-destructive",
            },
            {
              event: "synthesizer:started",
              desc: "The synthesizer is combining all findings",
              color: "text-accent",
            },
            {
              event: "review:completed",
              desc: "Final review posted to GitHub with verdict",
              color: "text-chart-5",
            },
            {
              event: "review:failed",
              desc: "The review pipeline encountered a fatal error",
              color: "text-destructive",
            },
            {
              event: "context:started",
              desc: "Codebase indexing has begun",
              color: "text-primary",
            },
            {
              event: "context:progress",
              desc: "Indexing progress update with step and percentage",
              color: "text-secondary",
            },
            {
              event: "context:completed",
              desc: "Indexing finished with file/convention/history counts",
              color: "text-chart-5",
            },
            {
              event: "context:failed",
              desc: "Indexing encountered an error",
              color: "text-destructive",
            },
            {
              event: "notification:new",
              desc: "A new notification has been created",
              color: "text-accent",
            },
          ].map((item) => (
            <div
              key={item.event}
              className="flex items-center gap-3 text-[10px]"
            >
              <span
                className={`clay-pill px-2 py-0.5 font-mono text-[9px] ${item.color} flex-shrink-0`}
              >
                {item.event}
              </span>
              <span className="text-muted-foreground truncate">
                {item.desc}
              </span>
            </div>
          ))}
        </div>
      </DocCard>

      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Dashboard Views
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            {
              name: "Pull Requests",
              desc: "Overview of all PRs with status, verdict, and quick actions",
              icon: GitPullRequest,
            },
            {
              name: "PR Detail",
              desc: "Deep dive into a specific review with agent progress, findings, and inline comments",
              icon: FileText,
            },
            {
              name: "Reviews",
              desc: "Chronological feed of all reviews across repos with filtering",
              icon: Clock,
            },
            {
              name: "Repos",
              desc: "Manage connected repos, settings, focus areas, and codebase index",
              icon: FolderGit2,
            },
            {
              name: "Analytics",
              desc: "Review statistics, agent performance, and trend analysis",
              icon: BarChart3,
            },
            {
              name: "Settings",
              desc: "API keys, default provider/model, and account preferences",
              icon: Settings,
            },
          ].map((view) => (
            <div
              key={view.name}
              className="clay-pressed p-3 flex items-start gap-2.5"
              style={{ borderRadius: "12px" }}
            >
              <view.icon className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold">{view.name}</p>
                <p className="text-[9px] text-muted-foreground">{view.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </DocCard>
    </div>
  );
}

/* ── CLI Section ── */

function CLISection() {
  return (
    <div>
      <SectionHeader
        icon={Terminal}
        title="CLI"
        subtitle="Review code from your terminal before you push. Install globally via npm."
      />

      {/* Install */}
      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Installation
        </p>
        <div
          className="clay-pressed p-3 font-mono text-xs flex items-center gap-2"
          style={{ borderRadius: "12px" }}
        >
          <span className="text-muted-foreground/40 select-none">$</span>
          <span className="text-primary">npm install -g @tarin/lgtm-cli</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Requires Node.js 18+. After install, the{" "}
          <code
            className="text-primary font-mono text-[10px] clay-pressed px-1.5 py-0.5 inline-block"
            style={{ borderRadius: "6px" }}
          >
            lgtm
          </code>{" "}
          command is available globally.
        </p>
      </DocCard>

      {/* Quick Start */}
      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
          Quick Start
        </p>
        <div className="space-y-4">
          <StepItem
            step={1}
            title="Authenticate"
            icon={Globe}
            description="Run lgtm login — opens GitHub OAuth in your browser. Tokens are stored locally at ~/.lgtm/config.json."
          />
          <StepItem
            step={2}
            title="Configure AI provider"
            icon={Key}
            description="Run lgtm config set-key --provider openai --key sk-... to save your API key. Supports OpenAI and Gemini."
          />
          <StepItem
            step={3}
            title="Connect and index your repo"
            icon={FolderGit2}
            description="Navigate to a GitHub repo directory. Run lgtm repo connect then lgtm repo index to enable context-aware reviews."
          />
          <StepItem
            step={4}
            title="Review your code"
            icon={Terminal}
            description="Run lgtm review to review all local changes, or lgtm review --staged for staged changes only. Results stream in real-time."
          />
        </div>
      </DocCard>

      {/* Commands Reference */}
      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Commands
        </p>
        <div className="space-y-1.5">
          {[
            { cmd: "lgtm login", desc: "Authenticate via GitHub OAuth" },
            { cmd: "lgtm logout", desc: "Clear stored credentials" },
            { cmd: "lgtm whoami", desc: "Show current authenticated user" },
            { cmd: "lgtm config set-key", desc: "Set AI provider and API key" },
            { cmd: "lgtm config show", desc: "Show current AI configuration" },
            { cmd: "lgtm repo connect", desc: "Connect current repo to LGTM" },
            {
              cmd: "lgtm repo index",
              desc: "Index repo for context-aware reviews",
            },
            {
              cmd: "lgtm repo status",
              desc: "Check connection and index status",
            },
            {
              cmd: "lgtm review",
              desc: "Review all local uncommitted changes",
            },
            { cmd: "lgtm review --staged", desc: "Review only staged changes" },
            {
              cmd: "lgtm review --pr <n>",
              desc: "Trigger review for a specific PR",
            },
            { cmd: "lgtm help", desc: "Show all available commands" },
          ].map((item) => (
            <div key={item.cmd} className="flex items-center gap-3 text-[10px]">
              <span className="clay-pill px-2 py-0.5 font-mono text-[9px] text-primary flex-shrink-0 min-w-[160px]">
                {item.cmd}
              </span>
              <span className="text-muted-foreground">{item.desc}</span>
            </div>
          ))}
        </div>
      </DocCard>

      {/* How Local Review Works */}
      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          How Local Review Works
        </p>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="clay-icon w-7 h-7 flex items-center justify-center bg-primary/10 flex-shrink-0">
              <span className="text-[10px] font-bold text-primary">1</span>
            </div>
            <div>
              <p className="text-xs font-bold">Diff Capture</p>
              <p className="text-[10px] text-muted-foreground">
                The CLI runs{" "}
                <code className="font-mono text-primary">git diff</code> (or{" "}
                <code className="font-mono text-primary">
                  git diff --cached
                </code>{" "}
                for staged) to capture your local changes.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="clay-icon w-7 h-7 flex items-center justify-center bg-primary/10 flex-shrink-0">
              <span className="text-[10px] font-bold text-primary">2</span>
            </div>
            <div>
              <p className="text-xs font-bold">Server-Side Analysis</p>
              <p className="text-[10px] text-muted-foreground">
                The diff is sent to the LGTM server via SSE (Server-Sent
                Events). All 6 agents run in parallel with your repo's indexed
                context.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="clay-icon w-7 h-7 flex items-center justify-center bg-primary/10 flex-shrink-0">
              <span className="text-[10px] font-bold text-primary">3</span>
            </div>
            <div>
              <p className="text-xs font-bold">Real-time Streaming</p>
              <p className="text-[10px] text-muted-foreground">
                Agent progress streams back to your terminal in real-time —
                spinners show each agent's status, findings count, and duration.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="clay-icon w-7 h-7 flex items-center justify-center bg-primary/10 flex-shrink-0">
              <span className="text-[10px] font-bold text-primary">4</span>
            </div>
            <div>
              <p className="text-xs font-bold">Verdict & Report</p>
              <p className="text-[10px] text-muted-foreground">
                The synthesizer produces a final verdict (approve / request
                changes / comment) with severity breakdown and top findings. A
                link to the full web report is provided.
              </p>
            </div>
          </div>
        </div>
      </DocCard>

      {/* Terminal Preview */}
      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Example Output
        </p>
        <div
          className="clay-pressed p-4 font-mono text-[10px] leading-relaxed space-y-1"
          style={{ borderRadius: "12px" }}
        >
          <p className="text-muted-foreground/40">$ lgtm review --staged</p>
          <p className="text-muted-foreground">
            Reviewing staged changes in{" "}
            <span className="text-foreground">acme/api</span>...
          </p>
          <p className="text-muted-foreground/60 mt-2">Agents running:</p>
          <p>
            <span className="text-chart-5">✓</span>{" "}
            <span className="text-foreground">Security</span>{" "}
            <span className="text-chart-5">2 issues</span>{" "}
            <span className="text-muted-foreground/40">(3.2s)</span>
          </p>
          <p>
            <span className="text-chart-5">✓</span>{" "}
            <span className="text-foreground">Bugs</span>{" "}
            <span className="text-chart-5">0 issues</span>{" "}
            <span className="text-muted-foreground/40">(2.8s)</span>
          </p>
          <p>
            <span className="text-chart-5">✓</span>{" "}
            <span className="text-foreground">Performance</span>{" "}
            <span className="text-chart-5">1 issue</span>{" "}
            <span className="text-muted-foreground/40">(3.5s)</span>
          </p>
          <p>
            <span className="text-chart-5">✓</span>{" "}
            <span className="text-foreground">Readability</span>{" "}
            <span className="text-chart-5">0 issues</span>{" "}
            <span className="text-muted-foreground/40">(2.1s)</span>
          </p>
          <p>
            <span className="text-chart-5">✓</span>{" "}
            <span className="text-foreground">Best Practices</span>{" "}
            <span className="text-chart-5">1 issue</span>{" "}
            <span className="text-muted-foreground/40">(2.9s)</span>
          </p>
          <p>
            <span className="text-chart-5">✓</span>{" "}
            <span className="text-foreground">Documentation</span>{" "}
            <span className="text-chart-5">0 issues</span>{" "}
            <span className="text-muted-foreground/40">(1.8s)</span>
          </p>
          <p>
            <span className="text-chart-5">✓</span>{" "}
            <span className="text-foreground">Synthesizer</span>{" "}
            <span className="text-chart-5">done</span>{" "}
            <span className="text-muted-foreground/40">(4.1s)</span>
          </p>
          <p className="text-muted-foreground/30 mt-2">
            ────────────────────────────────────
          </p>
          <p>
            Verdict: <span className="text-accent">REQUEST CHANGES</span>
          </p>
          <p>
            Confidence: <span className="text-foreground">87%</span>
          </p>
          <p className="text-muted-foreground/30">
            ────────────────────────────────────
          </p>
          <p className="mt-1">
            Issues found: <span className="text-destructive">2 critical</span>{" "}
            <span className="text-accent">1 medium</span>{" "}
            <span className="text-primary">1 low</span>
          </p>
          <p className="mt-2 text-muted-foreground/60">Top findings:</p>
          <p>
            {" "}
            <span className="text-destructive">CRITICAL</span>{" "}
            <span className="text-muted-foreground/40">auth.ts</span> SQL
            injection in login query
          </p>
          <p>
            {" "}
            <span className="text-destructive">CRITICAL</span>{" "}
            <span className="text-muted-foreground/40">auth.ts</span> JWT secret
            without fallback
          </p>
          <p>
            {" "}
            <span className="text-accent">MEDIUM</span>{" "}
            <span className="text-muted-foreground/40">user.ts</span> N+1 query
            in user lookup
          </p>
          <p className="mt-2 text-muted-foreground/40">
            Full report:{" "}
            <span className="text-primary underline">
              https://looksgoodtomeow.in/review/abc123
            </span>
          </p>
        </div>
      </DocCard>

      {/* Auth & Config */}
      <DocCard>
        <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
          Authentication & Storage
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] font-bold">Token Storage</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Credentials stored at{" "}
              <code className="font-mono text-primary">
                ~/.lgtm/config.json
              </code>
              . Includes JWT access token, refresh token, and API URL. Tokens
              auto-refresh when expired.
            </p>
          </div>
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-3.5 h-3.5 text-accent" />
              <p className="text-[11px] font-bold">Security</p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              API keys are stored server-side (encrypted), never in local
              config. The CLI authenticates via JWT and communicates over HTTPS.
            </p>
          </div>
        </div>
      </DocCard>
    </div>
  );
}

/* ── FAQ Section ── */

const FAQ_ITEMS = [
  {
    q: "Is my code stored on LGTM servers?",
    a: "No. Your code is fetched from GitHub during the review, sent to your configured AI provider, and discarded after the review completes. Only the review results (findings, verdict, comments) are stored.",
  },
  {
    q: "Which AI provider should I use?",
    a: "Both OpenAI and Gemini work well. For the best code review quality, we recommend GPT-5 or Gemini 2.5 Pro. For budget-conscious usage, GPT-5 Nano or Gemini 2.5 Flash Lite offer great value at a fraction of the cost.",
  },
  {
    q: "Can I use different models for different repos?",
    a: "Yes. Each repo can have its own AI provider and model override. Set this in the repo's expanded settings on the Repos page. If no override is set, the global default from Settings is used.",
  },
  {
    q: "What happens if an agent times out?",
    a: "Each agent has a 90-second timeout. If an agent times out, it's marked as failed and the synthesizer proceeds with findings from the remaining agents. The review still completes.",
  },
  {
    q: "Does LGTM support monorepos?",
    a: "Yes, with a cap of 3,000 files for indexing. The tree-sitter indexer processes the most important files first based on the repository structure. PageRank ensures the most connected files are prioritized.",
  },
  {
    q: "How does auto-indexing work?",
    a: "When code is pushed to the default branch (main), LGTM automatically re-indexes the codebase. This keeps the repo map, conventions, and PR history up to date for future reviews.",
  },
  {
    q: "Can I trigger a review manually?",
    a: "Yes. From the Pull Requests dashboard, click the review button on any PR to trigger a manual review, regardless of the auto-review setting.",
  },
  {
    q: "What does the maintainer review note mean?",
    a: "When LGTM approves a PR, it adds a note that a human maintainer will follow up with the final review. This is a reminder that AI reviews complement but don't replace human judgment.",
  },
  {
    q: "Is Anthropic (Claude) supported?",
    a: "Anthropic support is coming soon. The integration is built but currently disabled. Once enabled, you'll be able to use Claude models for reviews.",
  },
  {
    q: "How are inline comments placed?",
    a: "The synthesizer maps each finding to a specific file and line number from the PR diff. These are posted as native GitHub PR review comments, appearing directly on the relevant code lines.",
  },
];

function FAQSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div>
      <SectionHeader
        icon={HelpCircle}
        title="FAQ"
        subtitle="Frequently asked questions about LGTM."
      />

      <div className="space-y-2">
        {FAQ_ITEMS.map((item, i) => (
          <DocCard key={i} className="!mb-0">
            <button
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="w-full flex items-start justify-between gap-3 text-left"
            >
              <div className="flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs font-bold">{item.q}</p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${
                  openFaq === i ? "rotate-180" : ""
                }`}
              />
            </button>
            {openFaq === i && (
              <div className="mt-3 ml-[30px] pt-3 border-t border-white/[0.04]">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </div>
            )}
          </DocCard>
        ))}
      </div>
    </div>
  );
}
