/**
 * LGTM Security Watchdog Action.
 *
 * Runs as the first step of a customer's CI job. Asks the LGTM API "do you
 * have a halt decision for this commit?" and fails the job if yes.
 *
 * Soft-fail contract:
 *   - Network error / 5xx          → log warning, exit 0 (don't break CI on our outage)
 *   - 401 (bad/missing token)      → fail the job (this is the customer's misconfig)
 *   - 404 (no decision yet)        → poll until poll-timeout-seconds, then exit 0
 *   - 200 halt:false               → exit 0
 *   - 200 halt:true                → core.setFailed with reasons, exit 1
 *
 * The poll exists because workflows often start at the same instant as the
 * push that triggered the security scan. We give the scan ~90s to land
 * a decision before giving up. That's tunable via input.
 */
import * as core from "@actions/core";
import * as github from "@actions/github";

interface DecisionResponse {
  halt: boolean;
  reasons?: string[];
  reason?: string; // non-halt explanation: repo-not-tracked / decision-not-found / etc.
  computedAt?: string;
  repoFullName?: string;
  headSha?: string;
}

const USER_AGENT = "lgtm-security-watchdog-action/0.1.0";

async function run(): Promise<void> {
  try {
    const apiToken = core.getInput("api-token", { required: true });
    const apiUrl = (core.getInput("api-url") || "https://api.looksgoodtomeow.in").replace(/\/+$/, "");
    const failOnNetworkError = core.getBooleanInput("fail-on-network-error");
    const pollTimeoutSeconds = Number(core.getInput("poll-timeout-seconds") || "90");

    // Pull repo + sha from the workflow context so customers don't have to
    // pass them. There's a subtle bug if you just use `github.context.sha`:
    // for `pull_request` events GitHub injects a synthetic *merge* commit
    // SHA (the would-be merge of the PR), not the PR head SHA. LGTM caches
    // halt decisions keyed by the head SHA the review job actually scanned,
    // so the merge SHA never matches. Same risk on `pull_request_target`.
    //
    // Resolution: if the event payload exposes the PR head SHA, prefer it.
    // Falls back to `github.sha` for push/manual/other event types.
    const repo = `${github.context.repo.owner}/${github.context.repo.repo}`;
    const prPayload = (github.context.payload as { pull_request?: { head?: { sha?: string } } }).pull_request;
    const prHeadSha = prPayload?.head?.sha;
    const sha = prHeadSha || github.context.sha;
    if (!repo || !sha) {
      core.warning("Could not determine repo+sha from GitHub context. Skipping LGTM check.");
      return;
    }

    const shaSource = prHeadSha
      ? `PR head (event=${github.context.eventName})`
      : `commit (event=${github.context.eventName})`;
    core.info(
      `LGTM Security Watchdog · checking ${repo} @ ${sha.slice(0, 7)} [${shaSource}]`,
    );

    const deadline = Date.now() + Math.max(0, pollTimeoutSeconds) * 1000;
    let lastReason: string | undefined;

    while (true) {
      const result = await fetchDecision({ apiUrl, apiToken, repo, sha });

      if (result.kind === "halt") {
        const reasons = result.reasons.length > 0 ? result.reasons : ["Pipeline halt requested by LGTM Security"];
        core.setOutput("halt", "true");
        core.setOutput("reasons", reasons.join("\n"));
        core.setFailed(
          `LGTM Security halted this run:\n${reasons.map((r) => `  - ${r}`).join("\n")}\n\n` +
            `View details: https://looksgoodtomeow.in/dashboard/security`,
        );
        return;
      }

      if (result.kind === "pass") {
        core.setOutput("halt", "false");
        core.info(`LGTM Security: pass (${result.reason ?? "decision-clean"})`);
        return;
      }

      if (result.kind === "no-decision") {
        lastReason = result.reason;
        if (Date.now() >= deadline) {
          core.warning(
            `LGTM Security: no decision after ${pollTimeoutSeconds}s (${lastReason ?? "decision-not-found"}). Allowing the run to proceed.`,
          );
          core.setOutput("halt", "false");
          return;
        }
        // Wait 5s and retry. Stagger with a tiny jitter so multiple jobs
        // don't all retry at the same instant.
        const wait = 5000 + Math.floor(Math.random() * 1500);
        core.info(`No decision yet (${result.reason ?? "pending"}). Polling again in ${Math.round(wait / 1000)}s…`);
        await sleep(wait);
        continue;
      }

      if (result.kind === "auth-error") {
        // Customer misconfig — fail loud. We can't soft-fail on this because
        // it would silently disable the safety net the user opted into.
        core.setFailed(
          `LGTM Security: ${result.message}. Check that the LGTM_TOKEN secret is set to a valid token with the 'pipeline:read' scope. Generate at https://looksgoodtomeow.in/dashboard/security/tokens.`,
        );
        return;
      }

      // result.kind === "transient-error"
      if (failOnNetworkError) {
        core.setFailed(`LGTM Security check failed: ${result.message}`);
        return;
      }
      core.warning(
        `LGTM Security check could not complete: ${result.message}. Allowing the run to proceed (soft-fail). Pass fail-on-network-error: true to change this behavior.`,
      );
      core.setOutput("halt", "false");
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    core.warning(`LGTM Security Watchdog failed unexpectedly: ${message}. Allowing the run to proceed.`);
    core.setOutput("halt", "false");
  }
}

type DecisionResult =
  | { kind: "halt"; reasons: string[] }
  | { kind: "pass"; reason?: string }
  | { kind: "no-decision"; reason?: string }
  | { kind: "auth-error"; message: string }
  | { kind: "transient-error"; message: string };

async function fetchDecision(args: {
  apiUrl: string;
  apiToken: string;
  repo: string;
  sha: string;
}): Promise<DecisionResult> {
  const url = `${args.apiUrl}/pipeline/decision?repo=${encodeURIComponent(args.repo)}&sha=${encodeURIComponent(args.sha)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${args.apiToken}`,
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
    });
  } catch (err) {
    return {
      kind: "transient-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (res.status === 401 || res.status === 403) {
    return { kind: "auth-error", message: `${res.status} ${res.statusText}` };
  }

  let body: DecisionResponse | null = null;
  try {
    body = (await res.json()) as DecisionResponse;
  } catch {
    return { kind: "transient-error", message: `Invalid JSON from LGTM API (${res.status})` };
  }

  if (res.status === 404) {
    return { kind: "no-decision", reason: body?.reason };
  }
  if (res.status >= 500) {
    return { kind: "transient-error", message: `LGTM API returned ${res.status}` };
  }
  if (!res.ok) {
    return { kind: "transient-error", message: `Unexpected ${res.status}` };
  }

  if (body?.halt) {
    return { kind: "halt", reasons: body.reasons ?? [] };
  }
  return { kind: "pass", reason: body?.reason };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void run();
