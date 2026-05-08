import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Star,
  Shield,
  Brain,
  Sparkles,
  Eye,
  EyeOff,
  Clock,
  Cpu,
  Zap,
  Flag,
  ShieldCheck,
  KeyRound,
  Crown,
  ArrowRight,
  CreditCard,
  Infinity,
} from "lucide-react";
import api from "../api/axios";

type AIProvider = "anthropic" | "openai" | "gemini";

interface ProviderData {
  provider: AIProvider;
  maskedKey: string;
  addedAt: string;
  models: string[];
}

interface ProvidersState {
  providers: ProviderData[];
  defaultProvider: AIProvider | null;
  defaultModel: string | null;
  availableModels: Record<AIProvider, string[]>;
}

const PROVIDER_META: Record<
  AIProvider,
  {
    label: string;
    icon: typeof Star;
    color: string;
    bg: string;
    placeholder: string;
  }
> = {
  anthropic: {
    label: "Anthropic",
    icon: Brain,
    color: "text-chart-4",
    bg: "bg-chart-4/8",
    placeholder: "sk-ant-...",
  },
  openai: {
    label: "OpenAI",
    icon: Sparkles,
    color: "text-chart-5",
    bg: "bg-chart-5/8",
    placeholder: "sk-...",
  },
  gemini: {
    label: "Google Gemini",
    icon: Star,
    color: "text-accent",
    bg: "bg-accent/8",
    placeholder: "AIza...",
  },
};

const ACTIVE_PROVIDERS: AIProvider[] = ["openai", "gemini"];

const COMING_SOON_PROVIDERS = [
  {
    label: "Anthropic",
    icon: Brain,
    color: "text-chart-4",
    bg: "bg-chart-4/8",
  },
  {
    label: "Mistral AI",
    icon: Zap,
    color: "text-orange-400",
    bg: "bg-orange-400/8",
  },
  { label: "Cohere", icon: Cpu, color: "text-teal-400", bg: "bg-teal-400/8" },
];

// Per-model validation status
type ModelStatus = "idle" | "validating" | "valid" | "error";
interface ModelValidation {
  status: ModelStatus;
  error?: string;
}

export default function Settings() {
  const navigate = useNavigate();
  const [state, setState] = useState<ProvidersState | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingProvider, setAddingProvider] = useState<AIProvider | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);
  const [removingProvider, setRemovingProvider] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState(false);
  const [modelValidations, setModelValidations] = useState<
    Record<string, ModelValidation>
  >({});
  const [validatingProvider, setValidatingProvider] = useState<string | null>(
    null,
  );
  const [billingStatus, setBillingStatus] = useState<any>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const { data } = await api.get("/ai/providers");
      setState(data);
    } catch {
      /* handle error */
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBilling = useCallback(async () => {
    try {
      const { data } = await api.get("/billing/status");
      setBillingStatus(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchProviders();
    fetchBilling();

    // Check for billing success redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      setBillingSuccess(true);
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      // Refresh billing status after a short delay (webhook may take a moment)
      setTimeout(() => fetchBilling(), 3000);
    }
  }, [fetchProviders, fetchBilling]);

  const handleValidate = async () => {
    if (!addingProvider || !apiKeyInput.trim()) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const { data } = await api.post("/ai/providers/validate", {
        provider: addingProvider,
        apiKey: apiKeyInput.trim(),
      });
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: "Validation request failed" });
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!addingProvider || !apiKeyInput.trim()) return;
    setSaving(true);
    try {
      await api.post("/ai/providers", {
        provider: addingProvider,
        apiKey: apiKeyInput.trim(),
      });
      setAddingProvider(null);
      setApiKeyInput("");
      setValidationResult(null);
      setShowKey(false);
      await fetchProviders();
    } catch {
      /* handle error */
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (provider: string) => {
    setRemovingProvider(provider);
    try {
      await api.delete(`/ai/providers/${provider}`);
      await fetchProviders();
    } catch {
      /* handle error */
    } finally {
      setRemovingProvider(null);
    }
  };

  const handleSetDefault = async (provider: AIProvider, model: string) => {
    setSettingDefault(true);
    try {
      await api.patch("/ai/default", { provider, model });
      await fetchProviders();
    } catch {
      /* handle error */
    } finally {
      setSettingDefault(false);
    }
  };

  // Validate saved API key (lightweight check)
  const handleValidateKey = async (provider: AIProvider) => {
    setValidatingProvider(provider);
    try {
      const { data } = await api.post("/ai/providers/validate-saved", {
        provider,
      });
      const models = state?.availableModels[provider] || [];
      const newValidations = { ...modelValidations };
      for (const m of models) {
        newValidations[m] = data.valid
          ? { status: "valid" }
          : { status: "error", error: data.error || "Key validation failed" };
      }
      setModelValidations(newValidations);
    } catch {
      const models = state?.availableModels[provider] || [];
      const newValidations = { ...modelValidations };
      for (const m of models) {
        newValidations[m] = {
          status: "error",
          error: "Could not reach server",
        };
      }
      setModelValidations(newValidations);
    } finally {
      setValidatingProvider(null);
    }
  };

  // Validate a specific model (free metadata call)
  const handleValidateModel = async (provider: AIProvider, model: string) => {
    setModelValidations((prev) => ({
      ...prev,
      [model]: { status: "validating" },
    }));
    try {
      const { data } = await api.post("/ai/providers/validate-model", {
        provider,
        model,
      });
      setModelValidations((prev) => ({
        ...prev,
        [model]: data.valid
          ? { status: "valid" }
          : { status: "error", error: data.error || "Model test failed" },
      }));
    } catch {
      setModelValidations((prev) => ({
        ...prev,
        [model]: { status: "error", error: "Could not reach server" },
      }));
    }
  };

  const configuredProviders = state?.providers.map((p) => p.provider) || [];
  const unconfiguredProviders = ACTIVE_PROVIDERS.filter(
    (p) => !configuredProviders.includes(p),
  );

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try {
      const { data } = await api.post("/billing/checkout");
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      /* handle error */
    } finally {
      setCheckoutLoading(false);
    }
  };

  const isPaymentsLive = import.meta.env.VITE_DODO_ENV === "live";

  const isPro =
    billingStatus?.plan === "pro" &&
    billingStatus?.subscriptionStatus === "active";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="clay p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your account, AI providers, and preferences.
        </p>
      </div>

      {/* Billing redirect banner */}
      {billingSuccess && (
        <div
          className="clay-sm p-4 mb-6 flex items-center gap-3"
          style={{
            borderRadius: "16px",
            background: isPro
              ? "linear-gradient(145deg, #1a3a2a, #162820)"
              : "linear-gradient(145deg, #2a2a1a, #282016)",
          }}
        >
          {isPro ? (
            <CheckCircle2 className="w-5 h-5 text-chart-5 flex-shrink-0" />
          ) : (
            <Loader2 className="w-5 h-5 text-chart-5 flex-shrink-0 animate-spin" />
          )}
          <div>
            <p
              className={`text-sm font-bold ${isPro ? "text-chart-5" : "text-chart-5/80"}`}
            >
              {isPro ? "Pro plan activated" : "Payment processing"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isPro
                ? "You now have unlimited reviews and auto-review access."
                : "Your payment is being processed. This may take a moment — refresh the page shortly."}
            </p>
          </div>
        </div>
      )}

      {/* Billing / Plan Section */}
      {billingStatus && (
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-0.5">Plan</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Your current subscription and usage.
          </p>

          <div className="clay p-5" style={{ borderRadius: "20px" }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div
                  className={`clay-icon w-10 h-10 flex items-center justify-center ${isPro ? "bg-primary/10" : "bg-muted-foreground/8"}`}
                >
                  {isPro ? (
                    <Crown className="w-5 h-5 text-primary" />
                  ) : (
                    <CreditCard className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">
                      {isPro ? "Pro Plan" : "Free Plan"}
                    </p>
                    <span
                      className={`clay-pill px-2 py-0.5 text-[9px] font-bold ${isPro ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {isPro ? "ACTIVE" : "FREE"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {isPro ? "₹399/month" : "50 reviews per month"}
                  </p>
                </div>
              </div>

              {!isPro && isPaymentsLive && (
                <button
                  onClick={handleUpgrade}
                  disabled={checkoutLoading}
                  className="clay-btn clay-btn-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
                >
                  {checkoutLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Crown className="w-3.5 h-3.5" />
                  )}
                  Upgrade to Pro
                </button>
              )}
              {!isPro && !isPaymentsLive && (
                <div className="clay-pill px-4 py-2 text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Pro Coming Soon
                </div>
              )}
            </div>

            {/* Usage bar */}
            <div
              className="mt-4 clay-pressed p-3"
              style={{ borderRadius: "14px" }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">
                  Reviews this month
                </p>
                <p className="text-xs font-mono text-muted-foreground">
                  {billingStatus.reviewsUsed}
                  {billingStatus.reviewLimit
                    ? ` / ${billingStatus.reviewLimit}`
                    : ""}
                  {isPro && (
                    <span className="inline-flex items-center gap-1 ml-1 text-primary">
                      <Infinity className="w-3 h-3" />
                    </span>
                  )}
                </p>
              </div>
              {!isPro && billingStatus.reviewLimit && (
                <div className="w-full h-2 rounded-full bg-black/30 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (billingStatus.reviewsUsed / billingStatus.reviewLimit) * 100)}%`,
                      background:
                        billingStatus.reviewsUsed >= billingStatus.reviewLimit
                          ? "linear-gradient(90deg, #f87171, #ef4444)"
                          : "linear-gradient(90deg, #818cf8, #6366f1)",
                    }}
                  />
                </div>
              )}
              {billingStatus.resetDate && (
                <p className="text-[9px] text-muted-foreground/40 mt-1.5">
                  Resets{" "}
                  {new Date(billingStatus.resetDate).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" },
                  )}
                </p>
              )}
            </div>

            {/* Pro features reminder for free users */}
            {!isPro && isPaymentsLive && (
              <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                <ArrowRight className="w-3 h-3" />
                <span>
                  Upgrade for unlimited reviews and auto-review on PRs
                </span>
              </div>
            )}
            {!isPro && !isPaymentsLive && (
              <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                <Clock className="w-3 h-3" />
                <span>Pro plan with unlimited reviews is coming soon</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mb-4">
        <h2 className="text-lg font-bold mb-0.5">AI Providers</h2>
        <p className="text-xs text-muted-foreground">
          Add API keys for the LLM providers you want to use for PR reviews.
        </p>
        <button
          onClick={() => navigate("/dashboard/models")}
          className="text-[11px] text-primary hover:underline mt-1 inline-flex items-center gap-1"
        >
          Compare model pricing and TPM limits
          <Zap className="w-3 h-3" />
        </button>
      </div>

      {/* Configured providers */}
      {state?.providers && state.providers.length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-wider">
            Configured Providers
          </p>
          {state.providers.map((p) => {
            const meta = PROVIDER_META[p.provider];
            if (!meta) return null;
            const isDefault = state.defaultProvider === p.provider;
            const models = state.availableModels[p.provider] || [];
            const isKeyValidating = validatingProvider === p.provider;

            return (
              <div
                key={p.provider}
                className="clay p-4 sm:p-5"
                style={{ borderRadius: "20px" }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`clay-icon w-10 h-10 flex items-center justify-center ${meta.bg}`}
                    >
                      <meta.icon className={`w-5 h-5 ${meta.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold">{meta.label}</p>
                        {isDefault && (
                          <span className="clay-pill px-2 py-0.5 text-[9px] font-bold text-primary">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Key: {p.maskedKey}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(p.provider)}
                    disabled={removingProvider === p.provider}
                    className="clay-btn clay-btn-ghost p-2 text-destructive/60 hover:text-destructive"
                  >
                    {removingProvider === p.provider ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Action buttons row */}
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => handleValidateKey(p.provider)}
                    disabled={isKeyValidating}
                    className="clay-pill px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                  >
                    {isKeyValidating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5" />
                    )}
                    Test API Key
                  </button>
                  <button
                    onClick={() => {
                      models.forEach((m) => handleValidateModel(p.provider, m));
                    }}
                    className="clay-pill px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Check Model Access
                  </button>
                </div>

                {/* Model selector */}
                <div
                  className="clay-pressed p-3 sm:p-4"
                  style={{ borderRadius: "14px" }}
                >
                  <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
                    {isDefault ? "Default Model" : "Set as default"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {models.map((m) => {
                      const isSelected = isDefault && state.defaultModel === m;
                      const mv = modelValidations[m];
                      return (
                        <button
                          key={m}
                          onClick={() => handleSetDefault(p.provider, m)}
                          disabled={settingDefault}
                          className={`clay-pill px-3 py-2 transition-all ${
                            mv?.status === "error"
                              ? "border border-destructive/30 text-destructive"
                              : isSelected
                                ? "text-primary border border-primary/30"
                                : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span className="flex items-center gap-2 text-xs font-mono">
                            {mv?.status === "valid" && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-chart-5 flex-shrink-0" />
                            )}
                            {mv?.status === "error" && (
                              <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                            )}
                            {mv?.status === "validating" && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                            )}
                            {isSelected && !mv && (
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                            )}
                            {m}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Validation errors summary */}
                  {models.some(
                    (m) => modelValidations[m]?.status === "error",
                  ) && (
                    <div className="mt-3 space-y-1.5">
                      {models
                        .filter((m) => modelValidations[m]?.status === "error")
                        .map((m) => (
                          <div
                            key={m}
                            className="flex items-center justify-between gap-2 text-[10px] text-destructive/80"
                          >
                            <span className="font-mono truncate">
                              {m}: {modelValidations[m]?.error}
                            </span>
                            <button
                              className="clay-pill px-2 py-0.5 text-[9px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 flex-shrink-0"
                              title="Report this issue"
                            >
                              <Flag className="w-2.5 h-2.5" />
                              Report
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add provider section */}
      {unconfiguredProviders.length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-wider">
            Add Provider
          </p>
          {!addingProvider ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {unconfiguredProviders.map((p) => {
                const meta = PROVIDER_META[p];
                return (
                  <button
                    key={p}
                    onClick={() => {
                      setAddingProvider(p);
                      setApiKeyInput("");
                      setValidationResult(null);
                      setShowKey(false);
                    }}
                    className="clay-sm p-4 flex flex-col items-center gap-2.5 hover:scale-[1.02] transition-transform text-center"
                  >
                    <div
                      className={`clay-icon w-10 h-10 flex items-center justify-center ${meta.bg}`}
                    >
                      <meta.icon className={`w-5 h-5 ${meta.color}`} />
                    </div>
                    <p className="text-sm font-bold">{meta.label}</p>
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          ) : (
            <AddProviderForm
              provider={addingProvider}
              apiKeyInput={apiKeyInput}
              setApiKeyInput={setApiKeyInput}
              showKey={showKey}
              setShowKey={setShowKey}
              validating={validating}
              saving={saving}
              validationResult={validationResult}
              onValidate={handleValidate}
              onSave={handleSave}
              onCancel={() => {
                setAddingProvider(null);
                setApiKeyInput("");
                setValidationResult(null);
                setShowKey(false);
              }}
            />
          )}
        </div>
      )}

      {/* Coming soon */}
      <div className="space-y-3 mb-6">
        <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-wider">
          Coming Soon
        </p>
        <div className="grid sm:grid-cols-3 gap-2">
          {COMING_SOON_PROVIDERS.map((p) => (
            <div
              key={p.label}
              className="clay-sm p-4 flex flex-col items-center gap-2.5 text-center opacity-50 cursor-not-allowed select-none"
            >
              <div
                className={`clay-icon w-10 h-10 flex items-center justify-center ${p.bg}`}
              >
                <p.icon className={`w-5 h-5 ${p.color}`} />
              </div>
              <p className="text-sm font-bold">{p.label}</p>
              <span className="clay-pill px-2.5 py-0.5 text-[9px] font-bold text-muted-foreground flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                COMING SOON
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* No providers hint */}
      {configuredProviders.length === 0 && (
        <div
          className="clay-pressed p-4 flex items-start gap-3"
          style={{ borderRadius: "16px" }}
        >
          <Shield className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Add at least one AI provider key to start using Looks Good To Meow
            for PR reviews.
          </p>
        </div>
      )}
    </div>
  );
}

function AddProviderForm({
  provider,
  apiKeyInput,
  setApiKeyInput,
  showKey,
  setShowKey,
  validating,
  saving,
  validationResult,
  onValidate,
  onSave,
  onCancel,
}: {
  provider: AIProvider;
  apiKeyInput: string;
  setApiKeyInput: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  validating: boolean;
  saving: boolean;
  validationResult: { valid: boolean; error?: string } | null;
  onValidate: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const meta = PROVIDER_META[provider];

  return (
    <div className="clay p-5 sm:p-6" style={{ borderRadius: "20px" }}>
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`clay-icon w-10 h-10 flex items-center justify-center ${meta.bg}`}
        >
          <meta.icon className={`w-5 h-5 ${meta.color}`} />
        </div>
        <p className="text-sm font-bold">Add {meta.label} Key</p>
      </div>

      <div
        className="clay-pressed p-1 flex items-center gap-2 mb-3"
        style={{ borderRadius: "14px" }}
      >
        <input
          type={showKey ? "text" : "password"}
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder={meta.placeholder}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/30 font-mono"
        />
        <button
          onClick={() => setShowKey(!showKey)}
          className="p-2 text-muted-foreground hover:text-foreground"
        >
          {showKey ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>
      </div>

      {validationResult && (
        <div
          className={`clay-pressed p-3 mb-3 flex items-start gap-2 ${validationResult.valid ? "text-chart-5" : "text-destructive"}`}
          style={{ borderRadius: "12px" }}
        >
          {validationResult.valid ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-xs">
            {validationResult.valid
              ? "Key is valid"
              : validationResult.error || "Validation failed"}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onValidate}
          disabled={validating || !apiKeyInput.trim()}
          className="clay-btn clay-btn-ghost px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-40 flex items-center gap-1.5"
        >
          {validating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5" />
          )}
          Validate
        </button>
        <button
          onClick={onSave}
          disabled={saving || !apiKeyInput.trim()}
          className="clay-btn px-4 py-2 text-xs font-bold text-primary disabled:opacity-40 flex items-center gap-1.5"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          Save Key
        </button>
        <button
          onClick={onCancel}
          className="clay-btn clay-btn-ghost px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
