/**
 * Test script for all MongoDB models.
 * Run: npx ts-node src/scripts/test-models.ts
 *
 * Tests CRUD operations on PR, Review, and RepoContext models.
 * Uses the real database — creates test docs and cleans them up.
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import { connectDB } from "../config/db";
import { Repo } from "../models/Repo";
import { PR } from "../models/PR";
import { Review } from "../models/Review";
import { RepoContext } from "../models/RepoContext";

const TEST_PREFIX = "__test_model_";
let testRepoId: Types.ObjectId;
let testPRId: Types.ObjectId;
let testReviewId: Types.ObjectId;
let testContextId: Types.ObjectId;

function log(label: string, ok: boolean, detail?: string) {
  const icon = ok ? "[PASS]" : "[FAIL]";
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function testPRModel() {
  console.log("\n--- PR Model ---");

  // Create
  const pr = await PR.create({
    repoId: testRepoId,
    prNumber: 999,
    title: `${TEST_PREFIX}Fix auth bug`,
    body: "This PR fixes the authentication bypass vulnerability.",
    author: { login: "testuser", avatarUrl: "https://example.com/avatar.png" },
    headSha: "abc123def456",
    baseBranch: "main",
    headBranch: "fix/auth-bug",
    diffUrl: "https://github.com/test/repo/pull/999.diff",
    status: "pending",
    githubPRId: 123456789,
  });
  testPRId = pr._id as Types.ObjectId;
  log("Create PR", !!pr._id, `id: ${pr._id}`);

  // Read
  const found = await PR.findById(testPRId);
  log("Read PR", found?.title === `${TEST_PREFIX}Fix auth bug`);

  // Update status
  found!.status = "reviewing";
  await found!.save();
  const updated = await PR.findById(testPRId);
  log("Update PR status", updated?.status === "reviewing");

  // Unique compound index (repoId + prNumber)
  let dupError = false;
  try {
    await PR.create({
      repoId: testRepoId,
      prNumber: 999,
      title: "Duplicate",
      author: { login: "dup" },
      headSha: "dup",
      baseBranch: "main",
      headBranch: "dup",
      githubPRId: 999999,
    });
  } catch (err: any) {
    dupError = err.code === 11000;
  }
  log("Unique index (repoId+prNumber)", dupError, "duplicate rejected");

  // Query by status
  const pending = await PR.find({ status: "reviewing", repoId: testRepoId });
  log("Query by status", pending.length >= 1);
}

async function testReviewModel() {
  console.log("\n--- Review Model ---");

  // Create with agent reports
  const review = await Review.create({
    prId: testPRId,
    repoId: testRepoId,
    agentReports: [
      {
        agentType: "security",
        status: "completed",
        findings: [
          {
            file: "src/auth.ts",
            line: 42,
            severity: "critical",
            message: "SQL injection vulnerability in login query",
            suggestion:
              "Use parameterized queries instead of string concatenation",
          },
          {
            file: "src/auth.ts",
            line: 87,
            severity: "high",
            message: "Missing rate limiting on login endpoint",
            suggestion: "Add express-rate-limit middleware",
          },
        ],
        rawOutput: "Security scan completed. 2 issues found.",
        durationMs: 3200,
      },
      {
        agentType: "perf",
        status: "completed",
        findings: [
          {
            file: "src/db.ts",
            line: 15,
            severity: "medium",
            message: "N+1 query pattern detected",
            suggestion: "Use .populate() or aggregate pipeline",
          },
        ],
        rawOutput: "Performance analysis done.",
        durationMs: 1800,
      },
      {
        agentType: "summary",
        status: "pending",
        findings: [],
        rawOutput: "",
        durationMs: 0,
      },
    ],
    overallVerdict: "request_changes",
    finalSummary: "Found critical security issues that must be addressed.",
    confidenceScore: 87,
    githubCommentId: 0,
  });
  testReviewId = review._id as Types.ObjectId;
  log(
    "Create Review",
    !!review._id,
    `${review.agentReports.length} agent reports`,
  );

  // Read + verify nested structure
  const found = await Review.findById(testReviewId);
  log("Read Review", found?.overallVerdict === "request_changes");
  log(
    "Agent reports intact",
    found?.agentReports.length === 3 &&
      found.agentReports[0].agentType === "security" &&
      found.agentReports[0].findings.length === 2,
  );

  // Update agent status (simulate agent completing)
  const summaryAgent = found!.agentReports.find(
    (a) => a.agentType === "summary",
  );
  if (summaryAgent) {
    summaryAgent.status = "completed";
    summaryAgent.rawOutput = "PR adds auth fixes and rate limiting.";
    summaryAgent.durationMs = 950;
  }
  await found!.save();
  const updated = await Review.findById(testReviewId);
  const updatedSummary = updated?.agentReports.find(
    (a) => a.agentType === "summary",
  );
  log("Update agent report", updatedSummary?.status === "completed");

  // Confidence score validation (0-100)
  log("Confidence score", found?.confidenceScore === 87);

  // Query: find reviews with critical findings
  const withCritical = await Review.find({
    "agentReports.findings.severity": "critical",
    repoId: testRepoId,
  });
  log("Query critical findings", withCritical.length >= 1);

  // Severity enum validation
  let severityError = false;
  try {
    await Review.create({
      prId: testPRId,
      repoId: testRepoId,
      agentReports: [
        {
          agentType: "security",
          findings: [
            {
              file: "x.ts",
              line: 1,
              severity: "invalid_severity",
              message: "test",
            },
          ],
        },
      ],
    });
  } catch {
    severityError = true;
  }
  log("Severity enum validation", severityError, "invalid severity rejected");
}

async function testRepoContextModel() {
  console.log("\n--- RepoContext Model ---");

  // Generate a fake 768-dim embedding
  const fakeEmbedding = Array.from({ length: 768 }, (_, i) =>
    Math.sin(i * 0.01),
  );

  const ctx = await RepoContext.create({
    repoId: testRepoId,
    fileSummaries: [
      {
        path: "src/index.ts",
        summary: "Express server entry point with middleware setup",
        embedding: fakeEmbedding,
      },
      {
        path: "src/auth.ts",
        summary: "Authentication module with JWT and OAuth flows",
        embedding: fakeEmbedding.map((v) => v * 0.9),
      },
      {
        path: "src/db.ts",
        summary: "MongoDB connection and Mongoose configuration",
        embedding: fakeEmbedding.map((v) => v * 0.8),
      },
    ],
    conventions: [
      "Use camelCase for variables",
      "Prefer async/await over .then()",
      "All API responses use { data, error } shape",
    ],
    recentHistory: [
      "Added rate limiting to auth endpoints",
      "Migrated from Prisma to Mongoose",
      "Added Redis caching layer",
    ],
    indexStatus: "ready",
    lastIndexedAt: new Date(),
  });
  testContextId = ctx._id as Types.ObjectId;
  log(
    "Create RepoContext",
    !!ctx._id,
    `${ctx.fileSummaries.length} files indexed`,
  );

  // Read
  const found = await RepoContext.findOne({ repoId: testRepoId });
  log("Read RepoContext", found?.fileSummaries.length === 3);
  log("Conventions stored", found?.conventions.length === 3);
  log("Recent history stored", found?.recentHistory.length === 3);
  log("Index status", found?.indexStatus === "ready");

  // Embedding dimension validation
  log(
    "Embedding dimensions",
    found?.fileSummaries[0].embedding.length === 768,
    "768 dims",
  );

  // Invalid embedding dimension
  let dimError = false;
  try {
    await RepoContext.create({
      repoId: new Types.ObjectId(),
      fileSummaries: [{ path: "bad.ts", summary: "bad", embedding: [1, 2, 3] }],
    });
  } catch {
    dimError = true;
  }
  log("Embedding dimension validation", dimError, "wrong dims rejected");

  // Unique repoId constraint
  let uniqueError = false;
  try {
    await RepoContext.create({ repoId: testRepoId });
  } catch (err: any) {
    uniqueError = err.code === 11000;
  }
  log("Unique repoId constraint", uniqueError, "duplicate rejected");

  // Update: add a new file summary
  found!.fileSummaries.push({
    path: "src/utils.ts",
    summary: "Utility functions for encryption and formatting",
    embedding: fakeEmbedding.map((v) => v * 0.7),
  });
  found!.indexStatus = "indexing";
  await found!.save();
  const updated = await RepoContext.findById(testContextId);
  log("Update file summaries", updated?.fileSummaries.length === 4);
  log("Update index status", updated?.indexStatus === "indexing");

  // Note about vector search
  console.log(
    "\n  [INFO] Vector search ($vectorSearch) requires Atlas Vector Search index.",
  );
  console.log(
    '  [INFO] Create index "vector_index" on repocontexts.fileSummaries.embedding',
  );
  console.log("  [INFO] via Atlas UI: 768 dimensions, cosine similarity.");
}

async function cleanup() {
  console.log("\n--- Cleanup ---");
  await RepoContext.deleteMany({ _id: testContextId });
  await Review.deleteMany({ _id: testReviewId });
  await PR.deleteMany({ _id: testPRId });
  // Also clean up any leftover test data from failed runs
  await PR.deleteMany({ title: { $regex: TEST_PREFIX } });
  await Repo.deleteMany({ fullName: `${TEST_PREFIX}owner/${TEST_PREFIX}repo` });
  console.log("  [DONE] Test data cleaned up.\n");
}

async function main() {
  console.log("=== LGTM Model Tests ===\n");
  await connectDB();

  // Create a temporary test repo to reference
  const testRepo = await Repo.create({
    owner: `${TEST_PREFIX}owner`,
    name: `${TEST_PREFIX}repo`,
    fullName: `${TEST_PREFIX}owner/${TEST_PREFIX}repo`,
    githubRepoId: 999999999,
    connectedBy: new Types.ObjectId(),
    webhookId: 0,
  });
  testRepoId = testRepo._id as Types.ObjectId;
  console.log(`Test repo created: ${testRepoId}`);

  try {
    await testPRModel();
    await testReviewModel();
    await testRepoContextModel();
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }

  console.log("=== All tests complete ===");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
