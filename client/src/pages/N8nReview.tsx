import { useState, useRef, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import {
  Shield, Bug, Zap, BookOpen, CheckCircle, FileText,
  Play, Loader2, AlertTriangle, CheckCircle2, Info,
  ChevronDown, ChevronUp, Workflow,
} from "lucide-react";
import {
  triggerN8nReview,
  type N8nReviewResult,
  type AgentFinding,
} from "../api/n8nReview";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ff4444",
  high:     "#ff8800",
  medium:   "#f5c842",
  low:      "#60a5fa",
  info:     "#a1a1aa",
};

const AGENT_META: Record<string, { icon: any; label: string; color: string }> = {
  security:      { icon: Shield,      label: "Security",      color: "#ff4444" },
  bugs:          { icon: Bug,         label: "Bug Detection",  color: "#ff8800" },
  performance:   { icon: Zap,         label: "Performance",   color: "#f5c842" },
  readability:   { icon: BookOpen,    label: "Readability",   color: "#60a5fa" },
  "best-practices": { icon: CheckCircle, label: "Best Practices", color: "#34d399" },
  documentation: { icon: FileText,    label: "Documentation", color: "#a78bfa" },
};

const LANGUAGES = ["typescript","javascript","python","go","java","rust","cpp","csharp","ruby","php"];

const SAMPLE_CODE = `async function fetchUser(id) {
  const query = "SELECT * FROM users WHERE id = " + id;
  const password = "admin123";
  const result = await db.query(query);
  for (let i = 0; i <= result.length; i++) {
    console.log(result[i].name);
  }
  return result;
}`;

// ── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const fill = (score / 100) * c;
  const color = score >= 80 ? "#34d399" : score >= 60 ? "#f5c842" : "#ff4444";
  return (
    <div style={{ position: "relative", width: 128, height: 128 }}>
      <svg width="128" height="128" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${c}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 28, fontWeight: 800, color }}>{score}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>/ 100</span>
      </div>
    </div>
  );
}

// ── Finding Card ──────────────────────────────────────────────────────────────

function FindingCard({ f }: { f: AgentFinding }) {
  const [open, setOpen] = useState(false);
  const color = SEVERITY_COLOR[f.severity] ?? "#a1a1aa";
  return (
    <div onClick={() => setOpen(!open)} style={{
      background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.07)`,
      borderRadius: 10, padding: "10px 14px", cursor: "pointer",
      borderLeft: `3px solid ${color}`, transition: "background 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color, background: `${color}22`, borderRadius: 4, padding: "2px 6px" }}>
          {f.severity}
        </span>
        {f.line && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>L{f.line}</span>}
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", flex: 1 }}>{f.message}</span>
        {open ? <ChevronUp size={12} color="rgba(255,255,255,0.3)" /> : <ChevronDown size={12} color="rgba(255,255,255,0.3)" />}
      </div>
      {open && f.suggestion && (
        <p style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
          💡 {f.suggestion}
        </p>
      )}
    </div>
  );
}

// ── Agent Progress Card ───────────────────────────────────────────────────────

function AgentCard({ name, status, count }: { name: string; status: "idle" | "running" | "done" | "failed"; count?: number }) {
  const meta = AGENT_META[name] ?? { icon: CheckCircle, label: name, color: "#a1a1aa" };
  const Icon = meta.icon;
  return (
    <div style={{
      background: status === "done" ? `${meta.color}11` : "rgba(255,255,255,0.03)",
      border: `1px solid ${status === "done" ? `${meta.color}33` : "rgba(255,255,255,0.07)"}`,
      borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10,
      transition: "all 0.3s",
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${meta.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {status === "running"
          ? <Loader2 size={14} color={meta.color} style={{ animation: "spin 1s linear infinite" }} />
          : <Icon size={14} color={status === "idle" ? "rgba(255,255,255,0.25)" : meta.color} />}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: status === "idle" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.9)", margin: 0 }}>{meta.label}</p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          {status === "idle" ? "Waiting" : status === "running" ? "Analyzing…" : status === "done" ? `${count ?? 0} findings` : "Failed"}
        </p>
      </div>
      {status === "done" && <CheckCircle2 size={14} color={meta.color} />}
    </div>
  );
}

// ── Agent findings panel ──────────────────────────────────────────────────────

function AgentPanel({ name, findings }: { name: string; findings: AgentFinding[] }) {
  const [open, setOpen] = useState(true);
  const meta = AGENT_META[name] ?? { icon: CheckCircle, label: name, color: "#a1a1aa" };
  const Icon = meta.icon;
  if (!findings.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 0", background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
        <Icon size={14} color={meta.color} />
        <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>{meta.label}</span>
        <span style={{ fontSize: 11, color: meta.color, background: `${meta.color}22`, borderRadius: 10, padding: "1px 8px", marginLeft: 4 }}>{findings.length}</span>
        <span style={{ marginLeft: "auto" }}>{open ? <ChevronUp size={12} color="rgba(255,255,255,0.3)" /> : <ChevronDown size={12} color="rgba(255,255,255,0.3)" />}</span>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {findings.map((f, i) => <FindingCard key={i} f={f} />)}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type AgentStatus = "idle" | "running" | "done" | "failed";

export default function N8nReview() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [language, setLanguage] = useState("javascript");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<N8nReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, { status: AgentStatus; count?: number }>>({});
  const cancelRef = useRef<(() => void) | null>(null);

  const appendLog = (msg: string) => setLog((p) => [...p, msg]);

  const handleRun = useCallback(() => {
    if (running) { cancelRef.current?.(); return; }
    setRunning(true);
    setResult(null);
    setError(null);
    setLog([]);
    setAgentStatuses({});

    cancelRef.current = triggerN8nReview(
      { code, language },
      (event) => {
        if (event.type === "review:started") {
          appendLog(`✅ Review started — ID: ${event.data.reviewId}`);
          const init: Record<string, { status: AgentStatus }> = {};
          event.data.agents.forEach((a) => { init[a] = { status: "idle" }; });
          setAgentStatuses(init);
        } else if (event.type === "agent:started") {
          appendLog(`🔍 Running ${event.data.agentType} agent…`);
          setAgentStatuses((p) => ({ ...p, [event.data.agentType]: { status: "running" } }));
        } else if (event.type === "agent:completed") {
          appendLog(`✓ ${event.data.agentType}: ${event.data.findingsCount} findings (${event.data.durationMs}ms)`);
          setAgentStatuses((p) => ({ ...p, [event.data.agentType]: { status: "done", count: event.data.findingsCount } }));
        } else if (event.type === "synthesizer:started") {
          appendLog("🧠 Synthesizer running…");
        } else if (event.type === "review:completed") {
          appendLog(`🎉 Review complete! Score: ${event.data.score}/100`);
          setResult(event.data);
        } else if (event.type === "error") {
          setError(event.data.message);
        }
      },
      () => setRunning(false),
      (err) => { setError(err); setRunning(false); },
    );
  }, [code, language, running]);

  const verdictColor = result?.verdict === "approve" ? "#34d399" : result?.verdict === "request_changes" ? "#ff4444" : "#f5c842";
  const verdictLabel = result?.verdict === "approve" ? "✅ Approved" : result?.verdict === "request_changes" ? "❌ Changes Required" : "💬 Comment";

  return (
    <>
      <Helmet>
        <title>n8n AI Review — Problem Solvers</title>
        <meta name="description" content="Multi-agent AI code review powered by n8n orchestration" />
      </Helmet>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Workflow size={18} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>n8n AI Code Review</h1>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Multi-agent orchestration via n8n cloud</p>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
          {/* Left — code input */}
          <div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
              {/* toolbar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Language</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ fontSize: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", padding: "3px 8px", outline: "none" }}>
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <button onClick={() => setCode(SAMPLE_CODE)} style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer" }}>Load sample</button>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                placeholder="Paste your code here…"
                style={{
                  width: "100%", minHeight: 340, padding: 16, background: "transparent",
                  border: "none", outline: "none", color: "rgba(255,255,255,0.88)",
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 13,
                  lineHeight: 1.7, resize: "vertical", boxSizing: "border-box",
                }}
              />
            </div>

            <button
              id="n8n-run-btn"
              onClick={handleRun}
              disabled={!code.trim()}
              style={{
                width: "100%", padding: "13px", borderRadius: 12, border: "none", cursor: code.trim() ? "pointer" : "not-allowed",
                background: running ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                color: "#fff", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all 0.2s",
              }}
            >
              {running ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Analyzing… (click to cancel)</> : <><Play size={16} /> Run Multi-Agent Review</>}
            </button>

            {/* Log */}
            {log.length > 0 && (
              <div style={{ marginTop: 14, background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 12, fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.55)", maxHeight: 140, overflowY: "auto" }}>
                {log.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}

            {error && (
              <div style={{ marginTop: 14, background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.2)", borderRadius: 10, padding: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertTriangle size={14} color="#ff4444" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12, color: "#ff8888" }}>{error}</p>
              </div>
            )}

            {/* Results panel */}
            {result && (
              <div style={{ marginTop: 20 }}>
                {/* Verdict + score */}
                <div style={{ display: "flex", alignItems: "center", gap: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
                  <ScoreRing score={result.score} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${verdictColor}18`, border: `1px solid ${verdictColor}40`, borderRadius: 8, padding: "4px 12px", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: verdictColor }}>{verdictLabel}</span>
                    </div>
                    <p style={{ margin: "0 0 10px", fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{result.summary}</p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {Object.entries(result.severityCounts).filter(([, v]) => v > 0).map(([k, v]) => (
                        <span key={k} style={{ fontSize: 11, fontWeight: 600, color: SEVERITY_COLOR[k], background: `${SEVERITY_COLOR[k]}18`, borderRadius: 6, padding: "2px 8px" }}>
                          {v} {k}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top actions */}
                {result.topActions.length > 0 && (
                  <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
                    <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#818cf8", display: "flex", alignItems: "center", gap: 6 }}>
                      <Info size={13} /> Top Actions
                    </p>
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                      {result.topActions.map((a, i) => (
                        <li key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4, lineHeight: 1.5 }}>{a}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Per-agent findings */}
                {[
                  ["security", result.security],
                  ["bugs", result.bugs],
                  ["performance", result.performance],
                  ["readability", result.readability],
                  ["best-practices", result.bestPractices],
                  ["documentation", result.documentation],
                ].map(([name, findings]) => (
                  <AgentPanel key={name as string} name={name as string} findings={findings as AgentFinding[]} />
                ))}
              </div>
            )}
          </div>

          {/* Right — agent status panel */}
          <div style={{ position: "sticky", top: 24 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 16 }}>
              <p style={{ margin: "0 0 14px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1 }}>Agent Pipeline</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.keys(AGENT_META).map((name) => {
                  const s = agentStatuses[name];
                  return <AgentCard key={name} name={name} status={s?.status ?? "idle"} count={s?.count} />;
                })}
              </div>

              {result && (
                <div style={{ marginTop: 16, padding: "12px", background: "rgba(99,102,241,0.08)", borderRadius: 10, border: "1px solid rgba(99,102,241,0.15)" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 11, color: "#818cf8", fontWeight: 700 }}>Review ID</p>
                  <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.5)", wordBreak: "break-all" }}>{result.reviewId}</p>
                </div>
              )}

              {/* n8n badge */}
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "rgba(255,140,0,0.06)", border: "1px solid rgba(255,140,0,0.15)", borderRadius: 10 }}>
                <Workflow size={13} color="#ff8c00" />
                <div>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#ff8c00" }}>Powered by n8n</p>
                  <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Multi-agent orchestration</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
