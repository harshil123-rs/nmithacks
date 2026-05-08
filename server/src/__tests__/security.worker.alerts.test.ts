/**
 * Worker alert wiring tests — confirms that fireAlerts respects the
 * monitor.notify preferences and writes both an in-app Notification row
 * and an email send (when configured).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// ── GitHub mock (same as security.worker.test.ts) ───────────────────────────
const ghState: { files: Record<string, string> } = { files: {} };

vi.mock("../utils/github", () => ({
  getInstallationToken: vi.fn(async () => "fake-token"),
  githubAppFetch: vi.fn(async (path: string) => {
    const m = /\/repos\/[^/]+\/[^/]+\/contents\/([^?]+)/.exec(path);
    if (m) {
      const decoded = decodeURIComponent(m[1]);
      if (decoded in ghState.files) {
        return mockResponse(ghState.files[decoded], "text/plain");
      }
      const dirEntries = Object.keys(ghState.files)
        .filter((p) => p.startsWith(decoded + "/"))
        .filter((p) => p !== decoded);
      if (dirEntries.length > 0) {
        const items = Array.from(
          new Set(
            dirEntries.map((p) => {
              const after = p.slice(decoded.length + 1);
              const slash = after.indexOf("/");
              const name = slash === -1 ? after : after.slice(0, slash);
              const fullPath = decoded + "/" + name;
              const isFile = slash === -1;
              return JSON.stringify({
                name,
                path: fullPath,
                type: isFile ? "file" : "dir",
              });
            }),
          ),
        ).map((s) => JSON.parse(s));
        return mockResponse(JSON.stringify(items), "application/json");
      }
      return mockResponse("Not found", "text/plain", 404);
    }
    return mockResponse("Not found", "text/plain", 404);
  }),
}));

// ── Email mock — captures sendEmail calls instead of actually sending. ────
// Defined inline inside vi.mock because it's hoisted; we access the spy via
// the imported binding below.
vi.mock("../services/email.service", () => ({
  sendEmail: vi.fn(async () => ({ ok: true as const, messageId: "<mock>" })),
  isEmailConfigured: () => true,
}));

function mockResponse(body: string, contentType: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
    headers: new Map([["content-type", contentType]]),
  } as any;
}

import { Repo } from "../models/Repo";
import { User } from "../models/User";
import { SecurityMonitor } from "../models/SecurityMonitor";
import { SecurityAuditLog } from "../models/SecurityAuditLog";
import { SecurityScan } from "../models/SecurityScan";
import { Notification } from "../models/Notification";
import { DEFAULT_POLICY } from "../security/default-policy";
import { processSecurityJobForTest } from "./helpers/security-worker-test-helper";
import { sendEmail } from "../services/email.service";

// `sendEmail` was vi.mocked above. Cast to the spy shape so we can assert.
const sendEmailMock = sendEmail as unknown as ReturnType<
  typeof vi.fn<(...args: any[]) => Promise<{ ok: true; messageId: string }>>
>;

let mongo: MongoMemoryServer;
let userId: mongoose.Types.ObjectId;
let repoId: mongoose.Types.ObjectId;
let monitorId: mongoose.Types.ObjectId;

const BAD_WORKFLOW = `on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${"a".repeat(40)}
        with:
          ref: \${{ github.event.pull_request.head.sha }}`;

beforeAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const user = await User.create({
    githubId: "alert-user",
    username: "alice",
    email: "alice@example.com",
    githubAccessToken: "enc",
    githubInstallationId: 999,
    aiConfig: { providers: [] },
    billing: { plan: "pro", subscriptionStatus: "active" },
  });
  userId = user._id;

  const repo = await Repo.create({
    owner: "alice",
    name: "alerts-repo",
    fullName: "alice/alerts-repo",
    githubRepoId: 8001,
    connectedBy: userId,
    webhookId: 1,
    settings: {},
    isActive: true,
  });
  repoId = repo._id;

  const monitor = await SecurityMonitor.create({
    repoId,
    enabledBy: userId,
    policy: { ...DEFAULT_POLICY },
  });
  monitorId = monitor._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Notification.deleteMany({});
  await SecurityAuditLog.deleteMany({});
  await SecurityScan.deleteMany({});
  ghState.files = {};
  sendEmailMock.mockClear();
});

async function setNotify(opts: { inApp?: boolean; email?: boolean }) {
  await SecurityMonitor.updateOne(
    { _id: monitorId },
    {
      $set: {
        ...(opts.inApp !== undefined ? { "notify.inApp": opts.inApp } : {}),
        ...(opts.email !== undefined ? { "notify.email": opts.email } : {}),
      },
    },
  );
}

describe("security worker alert wiring", () => {
  it("writes an in-app Notification when inApp=true and a new block lands", async () => {
    await setNotify({ inApp: true, email: false });
    ghState.files = { ".github/workflows/ci.yml": BAD_WORKFLOW };
    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "alert-sha-1",
    });
    const notifs = await Notification.find({ userId });
    expect(notifs.length).toBe(1);
    expect(notifs[0].type).toBe("critical_security");
    expect(notifs[0].message).toMatch(/blocking issue/);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends an email when email=true and a new block lands", async () => {
    await setNotify({ inApp: false, email: true });
    ghState.files = { ".github/workflows/ci.yml": BAD_WORKFLOW };
    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "push",
      headSha: "alert-sha-2",
    });
    expect(sendEmailMock).toHaveBeenCalledOnce();
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe("alice@example.com");
    expect(call.subject).toMatch(/LGTM Security/);
    expect(call.subject).toMatch(/alice\/alerts-repo/);
    expect(call.html).toMatch(/blocking/i);
    // No in-app notification when inApp is off
    const notifs = await Notification.find({ userId });
    expect(notifs.length).toBe(0);
  });

  it("does not re-alert when the same block reappears on a different scan", async () => {
    await setNotify({ inApp: true, email: true });
    ghState.files = { ".github/workflows/ci.yml": BAD_WORKFLOW };

    // First scan — alerts fire (newCount > 0)
    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "alert-sha-3a",
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(await Notification.countDocuments({ userId })).toBe(1);

    // Second scan with same finding at same location — newCount is 0, no re-alert
    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "alert-sha-3b",
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1); // still 1
    expect(await Notification.countDocuments({ userId })).toBe(1);
  });

  it("does not send when both notify settings are off", async () => {
    await setNotify({ inApp: false, email: false });
    ghState.files = { ".github/workflows/ci.yml": BAD_WORKFLOW };
    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "alert-sha-4",
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await Notification.countDocuments({ userId })).toBe(0);
  });

  it("does not send when scan has only warn-action findings (no halt)", async () => {
    await setNotify({ inApp: true, email: true });
    // Plain unpinned action — produces only a warn-action finding
    ghState.files = {
      ".github/workflows/ci.yml": `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4`,
    };
    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "alert-sha-5",
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await Notification.countDocuments({ userId })).toBe(0);
  });

  it("skips email gracefully when the user has no email address", async () => {
    await setNotify({ inApp: true, email: true });
    await User.updateOne({ _id: userId }, { $set: { email: "" } });
    ghState.files = { ".github/workflows/ci.yml": BAD_WORKFLOW };
    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "alert-sha-6",
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    // In-app still fires
    expect(await Notification.countDocuments({ userId })).toBe(1);
    // Restore for any subsequent tests
    await User.updateOne(
      { _id: userId },
      { $set: { email: "alice@example.com" } },
    );
  });
});
