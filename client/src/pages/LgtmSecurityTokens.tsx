/**
 * Token management + runtime Action setup (`/dashboard/security/tokens`).
 *
 * Two purposes on one page:
 *   1. Generate / list / revoke long-lived API tokens (the "lgtm_pat_…" kind).
 *   2. Show the copy-paste GitHub Actions snippet for the runtime watchdog.
 *
 * The plaintext token is shown exactly once after generation. We don't
 * store it locally — same model as GitHub PATs.
 */
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Plus,
  Trash2,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Shield,
} from "lucide-react";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
  type ApiTokenRow,
  type CreatedApiToken,
} from "../api/security";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

const ACTION_SNIPPET = `# Add as the FIRST step of every job. Fails the job if LGTM Security
# computed a halt decision for this commit.
- name: LGTM Security gate
  uses: tarin-lgtm/security-watchdog-action@v1
  with:
    api-token: \${{ secrets.LGTM_TOKEN }}`;

function rel(iso?: string): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function LgtmSecurityTokens() {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<ApiTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [justCreated, setJustCreated] = useState<CreatedApiToken | null>(null);

  const refresh = async () => {
    try {
      setError(null);
      const data = await listApiTokens();
      setTokens(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <Helmet>
        <title>Tokens · LGTM Security</title>
      </Helmet>

      {/* ─────────── Top bar ─────────── */}
      <div className="flex items-start gap-4 flex-wrap">
        <button
          onClick={() => navigate("/dashboard/security")}
          aria-label="Back to LGTM Security"
          className="clay-sm p-2 rounded-xl shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <KeyRound className="w-5 h-5 text-primary shrink-0" />
            <h1 className="text-xl font-bold tracking-tight">API tokens</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xl leading-relaxed">
            Long-lived tokens used by the LGTM Security runtime Action to halt
            CI runs in your workflows.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={() => setShowCreate(true)}
        >
          New token
        </Button>
      </div>

      {error && (
        <div className="clay p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* ─────────── Active tokens panel ─────────── */}
      <div className="clay-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h2 className="text-sm font-bold">Active tokens</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Tokens are stored as SHA-256 hashes — plaintext is shown exactly
            once on creation
          </p>
        </div>
        {loading ? (
          <div className="px-6 py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : tokens.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <KeyRound className="w-7 h-7 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No tokens yet. Create one to wire up the runtime watchdog Action.
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowCreate(true)}
            >
              Create your first token
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {tokens.map((t) => (
              <TokenRow
                key={t.id}
                token={t}
                onRevoked={() => void refresh()}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─────────── Setup instructions panel ─────────── */}
      <div className="clay-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h2 className="text-sm font-bold">Wire up the runtime Action</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Three steps to halt CI runs that LGTM has flagged
          </p>
        </div>
        <div className="p-6 space-y-4">
          <ol className="text-sm space-y-3 list-decimal list-inside text-foreground/90 leading-relaxed">
            <li>
              <span className="font-semibold">Generate a token above</span>{" "}
              with the <code className="text-primary">pipeline:read</code>{" "}
              scope.
            </li>
            <li>
              In your repo on GitHub:{" "}
              <span className="font-mono text-xs">
                Settings → Secrets and variables → Actions → New repository secret
              </span>
              . Name it{" "}
              <code className="text-primary">LGTM_TOKEN</code>, paste the token.
            </li>
            <li>
              Add this snippet as the <strong>first step</strong> of any job
              you want gated:
            </li>
          </ol>
          <SnippetBlock content={ACTION_SNIPPET} />
          <p className="text-xs text-muted-foreground leading-relaxed">
            The Action soft-fails on LGTM API outages — your CI is never broken
            for our reasons. If LGTM detects a blocking issue (e.g. hardcoded
            secret, <code>pull_request_target</code> + PR-head checkout), the
            job exits non-zero before any other step runs.
          </p>
        </div>
      </div>

      {/* Create modal */}
      <Modal
        open={showCreate && !justCreated}
        onClose={() => setShowCreate(false)}
        title={
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            <span>New API token</span>
          </div>
        }
      >
        <CreateTokenForm
          onCreated={(t) => {
            setJustCreated(t);
            void refresh();
          }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {/* Plaintext-once modal */}
      <Modal
        open={!!justCreated}
        onClose={() => {
          setJustCreated(null);
          setShowCreate(false);
        }}
        maxWidth="max-w-xl"
        title={
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-chart-5" />
            <span>Token created</span>
          </div>
        }
      >
        {justCreated && (
          <CreatedTokenView
            token={justCreated}
            onClose={() => {
              setJustCreated(null);
              setShowCreate(false);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function TokenRow({
  token,
  onRevoked,
}: {
  token: ApiTokenRow;
  onRevoked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="px-6 py-3 flex items-center gap-3 hover:bg-white/1.5 transition-colors">
      <div className="clay-icon p-2 bg-primary/10 shrink-0">
        <KeyRound className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold truncate">{token.name}</p>
          {token.scopes.map((s) => (
            <span
              key={s}
              className="clay-pill text-[9px] uppercase font-bold px-2 py-0.5 text-primary"
            >
              {s}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
          {token.prefix}…  ·  created {rel(token.createdAt)}
          {token.lastUsedAt
            ? `  ·  last used ${rel(token.lastUsedAt)}`
            : "  ·  never used"}
        </p>
      </div>
      <Button
        variant="subtle"
        size="sm"
        icon={Trash2}
        loading={busy}
        title="Revoke"
        className="hover:text-destructive! hover:bg-destructive/8!"
        onClick={async () => {
          if (!confirm(`Revoke token "${token.name}"? Existing CI runs using it will start failing immediately.`)) return;
          setBusy(true);
          try {
            await revokeApiToken(token.id);
            onRevoked();
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function CreateTokenForm({
  onCreated,
  onCancel,
}: {
  onCreated: (t: CreatedApiToken) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold mb-1.5 block">
          Name
          <span className="text-muted-foreground font-normal ml-1">
            (helps you identify it later)
          </span>
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="lgtm-action prod"
          className="clay-pressed w-full p-3 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground/40"
          style={{ borderRadius: "12px" }}
        />
      </div>

      <div className="clay-sm p-3 text-xs text-muted-foreground leading-relaxed">
        <p className="mb-1">
          <span className="font-semibold text-foreground">Scope:</span>{" "}
          <code className="text-primary">pipeline:read</code>
        </p>
        <p>
          Lets the runtime Action read halt decisions for repos you've connected
          to LGTM. It cannot modify any data.
        </p>
      </div>

      {error && (
        <div className="clay-sm p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          loading={submitting}
          disabled={!name.trim()}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            try {
              const created = await createApiToken({
                name: name.trim(),
                scopes: ["pipeline:read"],
              });
              onCreated(created);
            } catch (err: any) {
              setError(err?.response?.data?.error ?? err.message);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          Create token
        </Button>
      </div>
    </div>
  );
}

function CreatedTokenView({
  token,
  onClose,
}: {
  token: CreatedApiToken;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <div className="clay-sm p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          {token.warning}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold mb-1.5">Your new token</p>
        <div className="clay-pressed p-3 flex items-center gap-2" style={{ borderRadius: "12px" }}>
          <code className="text-xs font-mono break-all flex-1 text-foreground/90">
            {token.token}
          </code>
          <Button
            variant="ghost"
            size="sm"
            icon={copied ? CheckCircle2 : Copy}
            onClick={async () => {
              if (await copy(token.token)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
        <p>
          <span className="font-semibold text-foreground">Next:</span> add this
          to your repo's GitHub Actions secrets as{" "}
          <code className="text-primary">LGTM_TOKEN</code>, then add the
          watchdog step to your workflow (snippet on the previous page).
        </p>
        <p>
          Closing this dialog won't reveal the token again. If you lose it,
          revoke this token and create a new one.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <Button variant="primary" size="md" onClick={onClose}>
          I've saved it
        </Button>
      </div>
    </div>
  );
}

function SnippetBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre
        className="clay-pressed p-4 text-xs font-mono text-foreground/90 overflow-x-auto leading-relaxed"
        style={{ borderRadius: "12px" }}
      >
        {content}
      </pre>
      <button
        onClick={async () => {
          if (await copy(content)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }
        }}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/40 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Copy snippet"
      >
        {copied ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-chart-5" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
