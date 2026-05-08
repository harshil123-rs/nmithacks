import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Star,
  Brain,
  Sparkles,
  DollarSign,
  ArrowDownUp,
  TrendingDown,
  Cpu,
} from "lucide-react";
import api from "../api/axios";

type AIProvider = "anthropic" | "openai" | "gemini";

interface ModelPricing {
  input: number;
  output: number;
  context: string;
  tpm: number;
}

const PROVIDER_META: Record<
  AIProvider,
  { label: string; icon: typeof Star; color: string; bg: string }
> = {
  anthropic: {
    label: "Anthropic",
    icon: Brain,
    color: "text-chart-4",
    bg: "bg-chart-4/8",
  },
  openai: {
    label: "OpenAI",
    icon: Sparkles,
    color: "text-chart-5",
    bg: "bg-chart-5/8",
  },
  gemini: {
    label: "Google Gemini",
    icon: Star,
    color: "text-accent",
    bg: "bg-accent/8",
  },
};

function formatPrice(n: number): string {
  return `${n < 1 ? n.toFixed(2) : n >= 10 ? n.toFixed(0) : n.toFixed(2)}`;
}

function formatTPM(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000).toFixed(0)}K`;
}

function isCheapest(
  model: string,
  field: "input" | "output",
  allModels: string[],
  pricing: Record<string, ModelPricing>,
): boolean {
  const val = pricing[model]?.[field];
  if (val === undefined) return false;
  const min = Math.min(
    ...allModels.map((m) => pricing[m]?.[field] ?? Infinity),
  );
  return val === min && allModels.length > 1;
}

export default function CompareModels() {
  const [loading, setLoading] = useState(true);
  const [availableModels, setAvailableModels] = useState<
    Record<AIProvider, string[]>
  >({} as Record<AIProvider, string[]>);
  const [pricing, setPricing] = useState<Record<string, ModelPricing>>({});
  const [filterProvider, setFilterProvider] = useState<AIProvider | "all">(
    "all",
  );
  const [sortField, setSortField] = useState<"input" | "output" | "model">(
    "input",
  );
  const [sortAsc, setSortAsc] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await api.get("/ai/providers");
      setAvailableModels(data.availableModels || {});
      setPricing(data.modelPricing || {});
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="clay p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading models...</p>
        </div>
      </div>
    );
  }

  // Build model rows
  const allRows: Array<{
    model: string;
    provider: AIProvider;
    input: number;
    output: number;
    context: string;
    tpm: number;
  }> = [];
  for (const [prov, models] of Object.entries(availableModels)) {
    for (const m of models) {
      const p = pricing[m];
      if (p) allRows.push({ model: m, provider: prov as AIProvider, ...p });
    }
  }

  const filteredRows =
    filterProvider === "all"
      ? allRows
      : allRows.filter((r) => r.provider === filterProvider);

  filteredRows.sort((a, b) => {
    if (sortField === "model")
      return sortAsc
        ? a.model.localeCompare(b.model)
        : b.model.localeCompare(a.model);
    return sortAsc ? a[sortField] - b[sortField] : b[sortField] - a[sortField];
  });

  const allModels = allRows.map((r) => r.model);
  const activeProviders = [...new Set(allRows.map((r) => r.provider))];

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="clay-icon w-10 h-10 flex items-center justify-center bg-accent/8">
            <Cpu className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Compare Models</h1>
            <p className="text-sm text-muted-foreground">
              Compare AI model pricing, context windows, and rate limits.
            </p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilterProvider("all")}
          className={`clay-pill px-3 py-1.5 text-xs font-medium transition-all ${filterProvider === "all" ? "text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"}`}
        >
          All Providers
        </button>
        {activeProviders.map((prov) => {
          const meta = PROVIDER_META[prov];
          return (
            <button
              key={prov}
              onClick={() => setFilterProvider(prov)}
              className={`clay-pill px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${filterProvider === prov ? `${meta.color} border border-current/30` : "text-muted-foreground hover:text-foreground"}`}
            >
              <meta.icon className="w-3 h-3" />
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Desktop table */}
      <div
        className="hidden sm:block clay overflow-hidden mb-4"
        style={{ borderRadius: "20px" }}
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-5 py-4">
                <button
                  onClick={() => {
                    setSortField("model");
                    setSortAsc(sortField === "model" ? !sortAsc : true);
                  }}
                  className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider hover:text-foreground transition-colors flex items-center gap-1"
                >
                  Model{" "}
                  {sortField === "model" && <ArrowDownUp className="w-3 h-3" />}
                </button>
              </th>
              <th className="text-left px-5 py-4 text-xs font-bold text-muted-foreground/60 uppercase tracking-wider">
                Provider
              </th>
              <th className="text-right px-5 py-4">
                <button
                  onClick={() => {
                    setSortField("input");
                    setSortAsc(sortField === "input" ? !sortAsc : true);
                  }}
                  className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider hover:text-foreground transition-colors inline-flex items-center gap-1 ml-auto"
                >
                  Input{" "}
                  {sortField === "input" && <ArrowDownUp className="w-3 h-3" />}
                </button>
              </th>
              <th className="text-right px-5 py-4">
                <button
                  onClick={() => {
                    setSortField("output");
                    setSortAsc(sortField === "output" ? !sortAsc : true);
                  }}
                  className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider hover:text-foreground transition-colors inline-flex items-center gap-1 ml-auto"
                >
                  Output{" "}
                  {sortField === "output" && (
                    <ArrowDownUp className="w-3 h-3" />
                  )}
                </button>
              </th>
              <th className="text-right px-5 py-4 text-xs font-bold text-muted-foreground/60 uppercase tracking-wider">
                Context
              </th>
              <th className="text-right px-5 py-4 text-xs font-bold text-muted-foreground/60 uppercase tracking-wider">
                TPM
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => {
              const meta = PROVIDER_META[row.provider];
              const cheapIn = isCheapest(
                row.model,
                "input",
                allModels,
                pricing,
              );
              const cheapOut = isCheapest(
                row.model,
                "output",
                allModels,
                pricing,
              );
              return (
                <tr
                  key={row.model}
                  className={`${i < filteredRows.length - 1 ? "border-b border-white/[0.03]" : ""} hover:bg-white/[0.02] transition-colors`}
                >
                  <td className="px-5 py-3.5 text-sm font-mono font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {row.model}
                      {(cheapIn || cheapOut) && (
                        <TrendingDown className="w-3 h-3 text-chart-5" />
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    <span
                      className={`inline-flex items-center gap-1.5 ${meta.color}`}
                    >
                      <meta.icon className="w-3.5 h-3.5" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-mono">
                    <span
                      className={cheapIn ? "text-chart-5 font-semibold" : ""}
                    >
                      ${formatPrice(row.input)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-mono">
                    <span
                      className={cheapOut ? "text-chart-5 font-semibold" : ""}
                    >
                      ${formatPrice(row.output)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm text-muted-foreground">
                    {row.context}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-mono text-primary">
                    {formatTPM(row.tpm)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2 mb-4">
        {filteredRows.map((row) => {
          const meta = PROVIDER_META[row.provider];
          const cheapIn = isCheapest(row.model, "input", allModels, pricing);
          const cheapOut = isCheapest(row.model, "output", allModels, pricing);
          return (
            <div
              key={row.model}
              className="clay-sm p-4"
              style={{ borderRadius: "16px" }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-mono font-medium text-foreground">
                  {row.model}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] ${meta.color}`}
                >
                  <meta.icon className="w-3 h-3" />
                  {meta.label}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div
                  className="text-center clay-pressed p-2.5"
                  style={{ borderRadius: "10px" }}
                >
                  <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">
                    Input
                  </p>
                  <p
                    className={`text-sm font-mono font-semibold ${cheapIn ? "text-chart-5" : ""}`}
                  >
                    ${formatPrice(row.input)}
                  </p>
                </div>
                <div
                  className="text-center clay-pressed p-2.5"
                  style={{ borderRadius: "10px" }}
                >
                  <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">
                    Output
                  </p>
                  <p
                    className={`text-sm font-mono font-semibold ${cheapOut ? "text-chart-5" : ""}`}
                  >
                    ${formatPrice(row.output)}
                  </p>
                </div>
                <div
                  className="text-center clay-pressed p-2.5"
                  style={{ borderRadius: "10px" }}
                >
                  <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">
                    Context
                  </p>
                  <p className="text-sm font-mono text-muted-foreground">
                    {row.context}
                  </p>
                </div>
                <div
                  className="text-center clay-pressed p-2.5"
                  style={{ borderRadius: "10px" }}
                >
                  <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-1">
                    TPM
                  </p>
                  <p className="text-sm font-mono text-primary">
                    {formatTPM(row.tpm)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground/40 text-right px-1">
        Prices per 1M tokens (USD). TPM = Tokens Per Minute (provider rate
        limit). Last updated March 2026.
      </p>
    </div>
  );
}
