/**
 * Email template: new blocking security finding(s) on an enrolled repo.
 *
 * Pure function. No I/O, no DB, no `nodemailer` dep — easy to snapshot-test.
 */

export interface SecurityAlertFinding {
  ruleId: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  file: string;
  line?: number;
}

export interface SecurityAlertInput {
  /** GitHub-style "owner/name". */
  repoFullName: string;
  /** Commit SHA the scan ran against. */
  headSha: string;
  /** Trigger the scan came from. Used in the body wording. */
  trigger: "push" | "schedule" | "manual" | "workflow_run" | "enrollment";
  /** All block-action findings from this scan (already filtered). */
  findings: SecurityAlertFinding[];
  /** How many of `findings` are new vs. carried over. */
  newCount: number;
  /** Total counts for the scan as a whole. */
  counts: { block: number; warn: number };
  /** URL to the LGTM dashboard repo detail. */
  dashboardUrl: string;
}

interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const SEVERITY_COLORS: Record<SecurityAlertFinding["severity"], string> = {
  critical: "#f87171",
  high: "#fbbf24",
  medium: "#fb923c",
  low: "#60a5fa",
  info: "#9ca3af",
};

export function renderSecurityAlertEmail(input: SecurityAlertInput): RenderedEmail {
  const blockCount = input.counts.block;
  const subject =
    blockCount === 1
      ? `[LGTM Security] 1 blocking issue on ${input.repoFullName}`
      : `[LGTM Security] ${blockCount} blocking issues on ${input.repoFullName}`;

  // Cap the list at 10 so we never produce a wall-of-text email.
  const visible = input.findings.slice(0, 10);
  const overflow = Math.max(0, input.findings.length - visible.length);

  const text = renderText(input, visible, overflow);
  const html = renderHtml(input, visible, overflow);

  return { subject, text, html };
}

function renderText(
  input: SecurityAlertInput,
  visible: SecurityAlertFinding[],
  overflow: number,
): string {
  const lines: string[] = [];
  lines.push(`LGTM Security — ${input.counts.block} blocking issue(s) on ${input.repoFullName}`);
  lines.push("");
  lines.push(
    input.newCount > 0
      ? `${input.newCount} new finding(s) detected on commit ${input.headSha.slice(0, 7)} (${input.trigger}).`
      : `Pre-existing blocking issues remain on commit ${input.headSha.slice(0, 7)} (${input.trigger}).`,
  );
  lines.push("");
  for (const f of visible) {
    lines.push(`  [${f.severity.toUpperCase()}] ${f.ruleId}`);
    lines.push(`    ${f.file}${f.line ? `:${f.line}` : ""}`);
    lines.push(`    ${f.message}`);
    lines.push("");
  }
  if (overflow > 0) {
    lines.push(`+ ${overflow} more finding(s). View all in the dashboard.`);
    lines.push("");
  }
  lines.push(`Dashboard: ${input.dashboardUrl}`);
  lines.push("");
  lines.push(
    "Tip: silence these alerts in the LGTM Security policy editor, " +
      "or mark individual findings as fixed / false-positive in the audit log.",
  );
  return lines.join("\n");
}

function renderHtml(
  input: SecurityAlertInput,
  visible: SecurityAlertFinding[],
  overflow: number,
): string {
  const lead =
    input.newCount > 0
      ? `<strong>${input.newCount} new finding${input.newCount === 1 ? "" : "s"}</strong> detected on commit <code>${escape(input.headSha.slice(0, 7))}</code> (${escape(input.trigger)}).`
      : `Pre-existing blocking issues remain on commit <code>${escape(input.headSha.slice(0, 7))}</code> (${escape(input.trigger)}).`;

  const findingsHtml = visible
    .map((f) => {
      const color = SEVERITY_COLORS[f.severity];
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #1f2937;vertical-align:top;width:80px;">
            <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${color}1a;color:${color};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">
              ${escape(f.severity)}
            </span>
          </td>
          <td style="padding:12px 16px 12px 0;border-bottom:1px solid #1f2937;vertical-align:top;">
            <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#9ca3af;margin-bottom:4px;">
              ${escape(f.ruleId)}
            </div>
            <div style="font-size:14px;color:#f3f4f6;line-height:1.5;margin-bottom:6px;">
              ${escape(f.message)}
            </div>
            <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#6b7280;">
              ${escape(f.file)}${f.line ? `:${f.line}` : ""}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  const overflowHtml =
    overflow > 0
      ? `<p style="margin:16px 0 0;font-size:13px;color:#9ca3af;">+ ${overflow} more finding(s). View all in the dashboard.</p>`
      : "";

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0d0d10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d10;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #1f2937;background:linear-gradient(145deg,#1a1f2e,#111827);">
              <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#f87171;color:#0d0d10;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">
                ${input.counts.block} Blocking ${input.counts.block === 1 ? "Issue" : "Issues"}
              </div>
              <h1 style="margin:12px 0 4px;font-size:18px;font-weight:700;color:#f9fafb;">
                LGTM Security — ${escape(input.repoFullName)}
              </h1>
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                ${lead}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${findingsHtml}
              </table>
              ${overflowHtml ? `<div style="padding:0 28px;">${overflowHtml}</div>` : ""}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 28px 28px;background:#0f1622;">
              <a href="${escape(input.dashboardUrl)}" style="display:inline-block;padding:10px 20px;background:#818cf8;color:#0d0d10;text-decoration:none;border-radius:10px;font-size:13px;font-weight:600;">
                View in dashboard
              </a>
              <p style="margin:16px 0 0;font-size:11px;color:#6b7280;line-height:1.5;">
                Silence these in the policy editor, or mark findings fixed / false-positive in the audit log.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#4b5563;">
          You're receiving this because you're enrolled in LGTM Security with email alerts on.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
