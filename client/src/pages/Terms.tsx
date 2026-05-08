import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, FileText } from "lucide-react";

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Terms of Service — LGTM</title>
        <meta
          name="description"
          content="Terms of service for LGTM (Looks Good To Meow), the AI-powered code review platform."
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
            <div className="clay-icon w-10 h-10 flex items-center justify-center bg-secondary/10">
              <FileText className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                Terms of Service
              </h1>
              <p className="text-xs text-muted-foreground">
                Effective: March 20, 2026
              </p>
            </div>
          </div>

          <div className="prose-custom space-y-6 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                1. Acceptance of Terms
              </h2>
              <p>
                By accessing or using Looks Good To Meow ("LGTM", "the
                Service"), you agree to be bound by these Terms of Service. If
                you do not agree, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                2. Description of Service
              </h2>

              <p>
                LGTM is an AI-powered code review platform that integrates with
                GitHub to analyze pull requests. The Service includes a web
                dashboard, a CLI tool, and a GitHub App that posts review
                comments on your pull requests.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                3. Account Registration
              </h2>
              <p>
                You must authenticate via GitHub to use LGTM. You are
                responsible for maintaining the security of your account. You
                must not share your authentication tokens or allow unauthorized
                access to your account.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                4. API Keys
              </h2>
              <p>
                LGTM requires you to provide your own AI provider API keys
                (OpenAI, Google Gemini). You are responsible for any charges
                incurred on your AI provider accounts. LGTM encrypts your keys
                at rest but is not liable for charges resulting from your use of
                the Service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                5. Subscription and Billing
              </h2>
              <p>
                LGTM offers a Free plan (50 reviews/month) and a Pro plan
                (₹399/month). Subscriptions are billed monthly through Dodo
                Payments. You may cancel at any time; cancellation takes effect
                at the end of the current billing period.
              </p>
              <p className="mt-2">
                We reserve the right to change pricing with 30 days notice.
                Existing subscribers will be notified before any price changes
                take effect.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                6. Acceptable Use
              </h2>
              <p>You agree not to:</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>Use the Service for any unlawful purpose</li>
                <li>
                  Attempt to reverse-engineer, decompile, or disassemble the
                  Service
                </li>
                <li>
                  Interfere with or disrupt the Service or its infrastructure
                </li>
                <li>Circumvent billing limits or abuse the free tier</li>
                <li>
                  Use the Service to process code you do not have rights to
                </li>
                <li>
                  Resell or redistribute the Service without authorization
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                7. Intellectual Property
              </h2>
              <p>
                LGTM and its original content, features, and functionality are
                owned by LGTM and are protected by applicable intellectual
                property laws. Your code remains your property — we claim no
                ownership over code you submit for review.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                8. AI-Generated Content
              </h2>
              <p>
                Review comments, suggestions, and analysis generated by LGTM are
                produced by third-party AI models and are provided "as-is."
                AI-generated reviews are not a substitute for human code review.
                You are responsible for evaluating and acting on any suggestions
                made by the Service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                9. Limitation of Liability
              </h2>
              <p>
                LGTM is provided "as is" without warranties of any kind. We are
                not liable for any damages arising from your use of the Service,
                including but not limited to:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>Incorrect or incomplete AI-generated review suggestions</li>
                <li>Security vulnerabilities not detected by the Service</li>
                <li>Service downtime or interruptions</li>
                <li>Charges incurred on your AI provider accounts</li>
                <li>
                  Data loss or unauthorized access due to factors beyond our
                  control
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                10. Termination
              </h2>
              <p>
                We may suspend or terminate your access to the Service at any
                time for violation of these Terms. You may delete your account
                at any time. Upon termination, your right to use the Service
                ceases immediately.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                11. Changes to Terms
              </h2>
              <p>
                We reserve the right to modify these Terms at any time. Material
                changes will be communicated via the Service or email. Continued
                use after changes constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                12. Governing Law
              </h2>
              <p>
                These Terms are governed by the laws of India. Any disputes
                shall be resolved in the courts of Bangalore, Karnataka, India.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">
                13. Contact
              </h2>
              <p>
                For questions about these Terms, contact us at{" "}
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
