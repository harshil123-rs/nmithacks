import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Zap,
  Check,
  Crown,
  Infinity,
  Shield,
  GitPullRequest,
  Bot,
  ArrowRight,
  DollarSign,
  Clock,
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

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

export default function Pricing() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [billingStatus, setBillingStatus] = useState<any>(null);
  const isPaymentsLive = import.meta.env.VITE_DODO_ENV === "live";

  const fetchData = useCallback(async () => {
    try {
      const res = await api
        .get("/billing/status")
        .catch(() => ({ data: null }));
      setBillingStatus(res.data);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try {
      const { data } = await api.post("/billing/checkout");
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="clay p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const isPro =
    billingStatus?.plan === "pro" &&
    billingStatus?.subscriptionStatus === "active";

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="clay-icon w-10 h-10 flex items-center justify-center bg-primary/8">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Plans</h1>
            <p className="text-sm text-muted-foreground">
              Choose the plan that fits your workflow.
            </p>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {/* Free Plan */}
        <div
          className="clay p-5 sm:p-6 flex flex-col"
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
            <span className="text-3xl font-bold">₹0</span>
            <span className="text-sm text-muted-foreground ml-1">/month</span>
          </div>

          <div className="space-y-3 flex-1 mb-5">
            {FREE_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="clay-icon w-7 h-7 flex items-center justify-center bg-muted-foreground/5">
                  <f.icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">{f.text}</span>
              </div>
            ))}
          </div>

          {!isPro && billingStatus && (
            <div
              className="clay-pressed p-3 text-center"
              style={{ borderRadius: "14px" }}
            >
              <p className="text-xs text-muted-foreground">
                {billingStatus.reviewsUsed}/{billingStatus.reviewLimit} reviews
                used this month
              </p>
            </div>
          )}
          {isPro && (
            <div
              className="clay-pressed p-3 text-center"
              style={{ borderRadius: "14px" }}
            >
              <p className="text-xs text-muted-foreground">
                Your previous plan
              </p>
            </div>
          )}
        </div>

        {/* Pro Plan */}
        <div
          className="clay-primary p-5 sm:p-6 flex flex-col relative overflow-hidden"
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
            <span className="text-3xl font-bold text-white">₹399</span>
            <span className="text-sm text-white/60 ml-1">/month</span>
          </div>
          <p className="text-[10px] text-white/40 mb-5">or ~399 INR/month</p>

          <div className="space-y-3 flex-1 mb-5">
            {PRO_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/10">
                  <f.icon className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm text-white/90">{f.text}</span>
              </div>
            ))}
          </div>

          {isPro ? (
            <div className="p-3 text-center rounded-2xl bg-white/10">
              <div className="flex items-center justify-center gap-2">
                <Check className="w-4 h-4 text-white" />
                <p className="text-sm font-bold text-white">Current Plan</p>
              </div>
            </div>
          ) : isPaymentsLive ? (
            <button
              onClick={handleUpgrade}
              disabled={checkoutLoading}
              className="w-full py-3 rounded-2xl bg-white text-primary-foreground font-bold text-sm hover:bg-white/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                background: "linear-gradient(145deg, #fff, #e8e8ff)",
                boxShadow:
                  "4px 4px 12px rgba(0,0,0,0.3), inset 1px 1px 2px rgba(255,255,255,0.8)",
              }}
            >
              {checkoutLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Upgrade to Pro
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <div className="w-full py-3 rounded-2xl bg-white/10 text-white/60 font-bold text-sm flex items-center justify-center gap-2 cursor-default">
              <Clock className="w-4 h-4" />
              Coming Soon
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
