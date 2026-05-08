import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Shield } from "lucide-react";

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Privacy Policy — LGTM</title>
        <meta
          name="description"
          content="Privacy policy for LGTM (Looks Good To Meow), the AI-powered code review platform."
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
        <div className="clay p-6 sm:p-10" style={{ borderRadius: "24px" }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="clay-icon w-10 h-10 flex items-center justify-center bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Privacy Policy</h1>
              <p className="text-xs text-muted-foreground">
                Effective: March 20, 2026
              </p>
            </div>
          </div>

          <div className="prose-custom space-y-6 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                1. Introduction
              </h2>
              <p>
                Looks Good To Meow ("LGTM", "we", "us", "our") is operated by
                Tarin Agarwal, an individual developer, at looksgoodtomeow.in.
                The LGTM CLI tool is published as @tarin/lgtm-cli. This Privacy
                Policy explains how we collect, use, disclose, and safeguard
                your information when you use our service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                2. Information We Collect
              </h2>

              <p className="font-medium text-foreground/80 mb-1">
                Account Information
              </p>
              <p>
                When you sign in via GitHub OAuth, we receive your GitHub
                username, email address, avatar URL, and GitHub user ID. We do
                not receive or store your GitHub password.
              </p>

              <p className="font-medium text-foreground/80 mb-1 mt-3">
                Repository Data
              </p>
              <p>
                When you connect a repository, we access pull request diffs,
                file contents (for context indexing), and PR metadata (titles,
                authors, branches). This data is used solely to perform code
                reviews.
              </p>

              <p className="font-medium text-foreground/80 mb-1 mt-3">
                API Keys
              </p>
              <p>
                AI provider API keys you configure are encrypted at rest using
                AES-256 encryption and are never exposed in plaintext after
                storage.
              </p>

              <p className="font-medium text-foreground/80 mb-1 mt-3">
                Payment Information
              </p>
              <p>
                Payments are processed by Dodo Payments. We do not store credit
                card numbers or payment credentials. We only store your
                subscription status and customer ID.
              </p>

              <p className="font-medium text-foreground/80 mb-1 mt-3">
                Usage Data
              </p>
              <p>
                We collect review counts, feature usage metrics, and basic
                analytics to improve the service. We do not use third-party
                tracking scripts or sell your data.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                3. How We Use Your Information
              </h2>
              <ul className="list-disc list-inside space-y-1">
                <li>To authenticate you and manage your account</li>
                <li>
                  To perform AI-powered code reviews on your pull requests
                </li>
                <li>To index your codebase for contextual review analysis</li>
                <li>To process subscription payments and manage billing</li>
                <li>To send notifications about review results</li>
                <li>To improve and maintain the service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                4. Data Storage and Security
              </h2>
              <p>
                Your data is stored on secure cloud infrastructure. API keys are
                encrypted using AES-256. All data in transit is encrypted via
                TLS. We use MongoDB Atlas for database storage with encryption
                at rest enabled.
              </p>
              <p className="mt-2">
                We retain your data for as long as your account is active. If
                you delete your account, we will remove your personal data
                within 30 days, except where retention is required by law.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                5. Third-Party Services
              </h2>
              <p>We use the following third-party services:</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>GitHub — authentication and repository access</li>
                <li>
                  OpenAI / Google Gemini — AI-powered code analysis (using your
                  own API keys)
                </li>
                <li>Dodo Payments — subscription billing</li>
                <li>Fly.io — server hosting</li>
                <li>Vercel — frontend hosting</li>
                <li>MongoDB Atlas — database</li>
                <li>Redis (RedisLabs) — job queue and caching</li>
              </ul>
              <p className="mt-2">
                Your code diffs are sent to the AI provider you configure
                (OpenAI or Gemini) using your own API key. We do not send your
                code to any AI provider without your explicit configuration.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                6. Data Sharing
              </h2>
              <p>
                We do not sell, rent, or share your personal information with
                third parties for marketing purposes. We may share data only:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>
                  With service providers necessary to operate LGTM (listed
                  above)
                </li>
                <li>If required by law or legal process</li>
                <li>To protect the rights and safety of LGTM and its users</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                7. Your Rights
              </h2>
              <p>You have the right to:</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>Access the personal data we hold about you</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your account and associated data</li>
                <li>Disconnect repositories at any time to stop data access</li>
                <li>Remove your AI provider keys at any time</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                8. Cookies
              </h2>
              <p>
                We use essential cookies and localStorage for authentication
                (JWT tokens). We do not use advertising or tracking cookies.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                9. Changes to This Policy
              </h2>
              <p>
                We may update this Privacy Policy from time to time. We will
                notify users of material changes via the service or email.
                Continued use of LGTM after changes constitutes acceptance of
                the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                10. Contact
              </h2>
              <p>
                If you have questions about this Privacy Policy, contact us at{" "}
                <a
                  href="mailto:tarinagarwal@gmail.com"
                  className="text-primary hover:underline"
                >
                  tarinagarwal@gmail.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
