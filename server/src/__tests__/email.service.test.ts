/**
 * Email service tests — pure unit tests using a vi.mock'd nodemailer.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const sendMailMock = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: sendMailMock,
    })),
  },
  createTransport: vi.fn(() => ({
    sendMail: sendMailMock,
  })),
}));

import {
  sendEmail,
  isEmailConfigured,
  _resetEmailTransportForTests,
} from "../services/email.service";
import { renderSecurityAlertEmail } from "../services/templates/securityAlertEmail";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  sendMailMock.mockReset();
  _resetEmailTransportForTests();
  // Reset env per-test
  process.env = { ...ORIGINAL_ENV };
});

describe("isEmailConfigured", () => {
  it("returns false when SMTP_HOST is missing", () => {
    delete process.env.SMTP_HOST;
    expect(isEmailConfigured()).toBe(false);
  });

  it("returns true when all SMTP_* are present", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.SMTP_FROM = "from@example.com";
    expect(isEmailConfigured()).toBe(true);
  });
});

describe("sendEmail", () => {
  it("returns smtp-not-configured when SMTP env is missing", async () => {
    delete process.env.SMTP_HOST;
    const result = await sendEmail({
      to: "x@y.com",
      subject: "s",
      html: "<b>h</b>",
      text: "h",
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe("smtp-not-configured");
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("returns no-recipient when `to` is empty", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.SMTP_FROM = "from@example.com";
    const result = await sendEmail({
      to: "",
      subject: "s",
      html: "h",
      text: "h",
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe("no-recipient");
  });

  it("returns email-disabled-via-env when EMAIL_DISABLED is true", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.SMTP_FROM = "from@example.com";
    process.env.EMAIL_DISABLED = "true";
    const result = await sendEmail({
      to: "x@y.com",
      subject: "s",
      html: "h",
      text: "h",
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe("email-disabled-via-env");
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("delegates to nodemailer.sendMail and returns messageId", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.SMTP_FROM = "from@example.com";
    sendMailMock.mockResolvedValue({ messageId: "<msg-1>" });
    const result = await sendEmail({
      to: "x@y.com",
      subject: "Hello",
      html: "<b>h</b>",
      text: "h",
    });
    expect(result.ok).toBe(true);
    if (result.ok === true) expect(result.messageId).toBe("<msg-1>");
    expect(sendMailMock).toHaveBeenCalledOnce();
    const call = sendMailMock.mock.calls[0][0];
    expect(call.from).toBe("from@example.com");
    expect(call.to).toBe("x@y.com");
    expect(call.subject).toBe("Hello");
    expect(call.html).toBe("<b>h</b>");
    expect(call.text).toBe("h");
  });

  it("captures sendMail errors as send-failed (never throws)", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.SMTP_FROM = "from@example.com";
    sendMailMock.mockRejectedValue(new Error("connection refused"));
    const result = await sendEmail({
      to: "x@y.com",
      subject: "s",
      html: "h",
      text: "h",
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toMatch(/connection refused/);
  });
});

describe("renderSecurityAlertEmail", () => {
  it("produces a sensible single-issue subject + body", () => {
    const out = renderSecurityAlertEmail({
      repoFullName: "alice/repo",
      headSha: "abcdef0123",
      trigger: "push",
      newCount: 1,
      counts: { block: 1, warn: 0 },
      findings: [
        {
          ruleId: "secrets.hardcoded",
          severity: "critical",
          message: "Potential hardcoded secret detected",
          file: ".github/workflows/ci.yml",
          line: 3,
        },
      ],
      dashboardUrl: "https://looksgoodtomeow.in/dashboard/security/abc",
    });
    expect(out.subject).toBe("[LGTM Security] 1 blocking issue on alice/repo");
    expect(out.text).toMatch(/secrets\.hardcoded/);
    expect(out.text).toMatch(/CRITICAL/);
    expect(out.html).toMatch(/secrets\.hardcoded/);
    expect(out.html).toMatch(/critical/i);
    // Dashboard link present
    expect(out.html).toMatch(/looksgoodtomeow\.in\/dashboard\/security\/abc/);
  });

  it("escapes user-controlled content in HTML to avoid injection", () => {
    const out = renderSecurityAlertEmail({
      repoFullName: "<script>alert(1)</script>/x",
      headSha: "abcdef0",
      trigger: "push",
      newCount: 1,
      counts: { block: 1, warn: 0 },
      findings: [
        {
          ruleId: "<img onerror=alert(1)>",
          severity: "critical",
          message: "<b>x</b>",
          file: "<a>",
        },
      ],
      dashboardUrl: "https://looksgoodtomeow.in",
    });
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).not.toContain("<img onerror=alert(1)>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("truncates long finding lists with an overflow line", () => {
    const findings = Array.from({ length: 15 }, (_, i) => ({
      ruleId: `rule-${i}`,
      severity: "critical" as const,
      message: `m-${i}`,
      file: `f-${i}.yml`,
    }));
    const out = renderSecurityAlertEmail({
      repoFullName: "a/b",
      headSha: "abc",
      trigger: "schedule",
      newCount: 15,
      counts: { block: 15, warn: 0 },
      findings,
      dashboardUrl: "https://x",
    });
    // The text body shows 10 + an overflow line
    expect(out.text.match(/CRITICAL/g)?.length).toBe(10);
    expect(out.text).toMatch(/\+ 5 more finding/);
  });
});
