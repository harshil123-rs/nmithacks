import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  Lock,
  Shield,
  KeyRound,
  Eye,
  Server,
  Database,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export default function Security() {
  const navigate = useNavigate();

  const practices = [
    {
      icon: KeyRound,
      title: "Encrypted API Keys",
      description:
        "Your AI provider API keys are encrypted at rest using AES-256 encryption. Keys are never logged, exposed in API responses, or stored in plaintext.",
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: Lock,
      title: "TLS Everywhere",
      description:
        "All data in transit is encrypted via TLS 1.2+. This includes communication between your browser and our servers, and between our servers and third-party APIs.",
      color: "text-chart-5",
      bg: "bg-chart-5/10",
    },
    {
      icon: Shield,
      title: "GitHub App Permissions",
      description:
        "LGTM requests only the minimum GitHub permissions needed: read access to repository contents and pull requests, and write access to post review comments.",
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      icon: Eye,
      title: "Your Keys, Your Control",
      description:
        "We never use our own AI API keys for your reviews. You bring your own OpenAI or Gemini key, meaning your code is processed under your own API agreement with the provider.",
      color: "text-secondary",
      bg: "bg-secondary/10",
    },
    {
      icon: Database,
      title: "Database Security",
      description:
        "Data is stored in MongoDB Atlas with encryption at rest, network isolation, and automated backups. Access is restricted to authenticated application connections only.",
      color: "text-chart-4",
      bg: "bg-chart-4/10",
    },
    {
      icon: Server,
      title: "Infrastructure",
      description:
        "Our server runs on Fly.io with isolated containers, automatic TLS certificates, and DDoS protection. The frontend is hosted on Vercel with edge caching.",
      color: "text-muted-foreground",
      bg: "bg-muted-foreground/10",
    },
    {
      icon: RefreshCw,
      title: "Token Rotation",
      description:
        "JWT authentication tokens have short expiry windows with automatic refresh. GitHub installation tokens are short-lived and rotated per-request.",
      color: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Security — LGTM</title>
        <meta
          name="description"
          content="Security practices and responsible disclosure policy for LGTM (Looks Good To Meow)."
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
          <div className="flex items-center gap-3 mb-4">
            <div className="clay-icon w-12 h-12 flex items-center justify-center bg-chart-5/10">
              <Shield className="w-6 h-6 text-chart-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Security</h1>
              <p className="text-xs text-muted-foreground">
                How we protect your code and data
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            Security is foundational to LGTM. We handle source code and API
            credentials, so we take every precaution to ensure your data is
            protected. Here's how.
          </p>
        </div>

        {/* Practices grid */}
        <div className="grid sm:grid-cols-2 gap-3">
          {practices.map((p) => (
            <div
              key={p.title}
              className="clay p-5"
              style={{ borderRadius: "20px" }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`clay-icon w-9 h-9 flex items-center justify-center ${p.bg}`}
                >
                  <p.icon className={`w-4.5 h-4.5 ${p.color}`} />
                </div>
                <h3 className="text-sm font-bold">{p.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {p.description}
              </p>
            </div>
          ))}
        </div>

        {/* What we don't do */}
        <div className="clay p-6 sm:p-8 mt-6" style={{ borderRadius: "24px" }}>
          <h2 className="text-lg font-bold mb-4">What We Don't Do</h2>
          <div className="space-y-2.5">
            {[
              "We never store your code permanently — diffs are processed and discarded after review",
              "We never share your code with other users or third parties",
              "We never use your code to train AI models",
              "We never access repositories you haven't explicitly connected",
              "We never store credit card numbers — payments are handled by Dodo Payments",
              "We never use tracking cookies or third-party analytics scripts",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-chart-5 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Responsible disclosure */}
        <div
          className="clay-pressed p-5 mt-6 flex items-start gap-3"
          style={{ borderRadius: "20px" }}
        >
          <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold mb-1">Responsible Disclosure</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              If you discover a security vulnerability, please report it to{" "}
              <a
                href="mailto:tarinagarwal@gmail.com"
                className="text-primary hover:underline"
              >
                tarinagarwal@gmail.com
              </a>
              . We take all reports seriously and will respond within 48 hours.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
