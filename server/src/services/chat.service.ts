/**
 * PR Chat Service
 *
 * Handles @tarin-lgtm mentions in PR comments.
 * Parses commands, fetches conversation history from GitHub,
 * builds context, calls LLM, and posts reply.
 */
import { Repo, type IRepo } from "../models/Repo";
import { PR } from "../models/PR";
import { Review } from "../models/Review";
import { RepoContext } from "../models/RepoContext";
import { User } from "../models/User";
import { decrypt } from "../utils/encryption";
import { getInstallationToken, githubAppFetch } from "../utils/github";
import { callLLM, resolveProvider, type CallLLMOptions } from "./ai.service";
import Redis from "ioredis";

const BOT_SLUG = process.env.GITHUB_APP_SLUG || "tarin-lgtm";
const MENTION_REGEX = new RegExp(`@${BOT_SLUG}\\s+`, "i");
const VALID_COMMANDS = ["explain", "fix", "improve", "test"];
const MAX_EXCHANGES = 10;
const CONTEXT_LINES = 20; // lines above/below for line comments

let redis: Redis | null = null;
try {
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  }
} catch {
  /* no redis */
}

interface ParsedCommand {
  command: string;
  message: string;
}

function parseCommand(body: string): ParsedCommand | null {
  const mentionMatch = body.match(
    new RegExp(`@${BOT_SLUG}\\s+(\\S+)(.*)`, "is"),
  );
  if (!mentionMatch) return null;
  const command = mentionMatch[1].toLowerCase().trim();
  const message = (mentionMatch[2] || "").trim();
  return { command, message };
}

function stripMentions(text: string): string {
  return text.replace(new RegExp(`@${BOT_SLUG}\\s*`, "gi"), "").trim();
}

async function checkRateLimit(repoId: string, limit: number): Promise<boolean> {
  if (!redis) return true; // no redis = no rate limiting
  const today = new Date().toISOString().slice(0, 10);
  const key = `chat:ratelimit:${repoId}:${today}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 86400);
  return count <= limit;
}

async function postComment(
  repoFullName: string,
  prNumber: number,
  body: string,
  token: string,
  inReplyTo?: number,
): Promise<void> {
  if (inReplyTo) {
    // Reply to a review comment thread
    await githubAppFetch(
      `/repos/${repoFullName}/pulls/${prNumber}/comments/${inReplyTo}/replies`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      },
    );
  } else {
    // Regular issue comment
    await githubAppFetch(
      `/repos/${repoFullName}/issues/${prNumber}/comments`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      },
    );
  }
}

/**
 * Handle an issue_comment event (PR thread comment).
 */
export async function handleIssueComment(body: any): Promise<void> {
  const action = body.action;
  if (action !== "created") return;

  const comment = body.comment;
  const commentBody: string = comment?.body || "";
  if (!MENTION_REGEX.test(commentBody)) return;

  const repoFullName: string = body.repository?.full_name;
  const prNumber: number = body.issue?.number;
  const isPR = !!body.issue?.pull_request;
  if (!isPR || !repoFullName || !prNumber) return;

  console.log(`[Chat] Issue comment mention on ${repoFullName}#${prNumber}`);

  const repo = await Repo.findOne({ fullName: repoFullName, isActive: true });
  if (!repo) {
    console.log(`[Chat] Repo not found: ${repoFullName}`);
    return;
  }

  const parsed = parseCommand(commentBody);
  if (!parsed) return;

  const user = await User.findById(repo.connectedBy);
  if (!user?.githubInstallationId) return;

  // Maintainer bypass: allow the repo owner to use chat even when prChat is off
  const senderLogin = comment.user?.login?.toLowerCase();
  const isMaintainer = senderLogin === user.username?.toLowerCase();

  if (!repo.settings.prChat && !isMaintainer) {
    console.log(
      `[Chat] PR Chat disabled for ${repoFullName}, sender ${senderLogin} is not maintainer`,
    );
    return;
  }

  const token = await getInstallationToken(user.githubInstallationId);

  // Check rate limit
  if (
    !(await checkRateLimit(
      repo._id.toString(),
      repo.settings.dailyChatLimit ?? 50,
    ))
  ) {
    await postComment(
      repoFullName,
      prNumber,
      "Daily chat limit reached for this repo.",
      token,
    );
    return;
  }

  // Unrecognized command
  if (!repo.settings.allowedCommands.includes(parsed.command)) {
    if (!VALID_COMMANDS.includes(parsed.command)) {
      const helpLines = repo.settings.allowedCommands.map(
        (cmd) => `- \`@${BOT_SLUG} ${cmd}\``,
      );
      await postComment(
        repoFullName,
        prNumber,
        `I didn't recognize that command. Here's what I can do:\n\n${helpLines.join("\n")}`,
        token,
      );
      return;
    }
    // Command exists but not allowed for this repo
    await postComment(
      repoFullName,
      prNumber,
      `The \`${parsed.command}\` command is not enabled for this repository.`,
      token,
    );
    return;
  }

  // Fetch conversation history from GitHub (issue comments)
  const historyRes = await githubAppFetch(
    `/repos/${repoFullName}/issues/${prNumber}/comments?per_page=100`,
    token,
  );
  const allComments: any[] = historyRes.ok
    ? ((await historyRes.json()) as any[])
    : [];

  // Filter to only the triggering user and the bot
  const botLogin = `${BOT_SLUG}[bot]`.toLowerCase();
  const relevant = allComments.filter((c: any) => {
    const login = c.user?.login?.toLowerCase() || "";
    return login === senderLogin || login === botLogin;
  });

  // Build message history (last N exchanges)
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const c of relevant.slice(-MAX_EXCHANGES * 2)) {
    const login = c.user?.login?.toLowerCase() || "";
    const role = login === botLogin ? "assistant" : "user";
    messages.push({ role, content: stripMentions(c.body) });
  }

  // Build context
  const context = await buildChatContext(repo, prNumber, token);

  // Resolve LLM
  let llmOptions: CallLLMOptions;
  try {
    const decryptedProviders = user.aiConfig.providers.map((p) => ({
      provider: p.provider,
      apiKey: decrypt(p.apiKey),
    }));
    const resolved = resolveProvider({
      repoAiProvider: repo.settings.aiProvider,
      repoAiModel: repo.settings.aiModel,
      userDefaultProvider: user.aiConfig.defaultProvider,
      userDefaultModel: user.aiConfig.defaultModel,
      userProviders: decryptedProviders,
    });
    llmOptions = {
      provider: resolved.provider,
      model: resolved.model,
      apiKey: resolved.apiKey,
    };
  } catch (err: any) {
    console.error(`[Chat] LLM provider error: ${err.message}`);
    return;
  }

  const reply = await generateChatReply(parsed, messages, context, llmOptions);
  await postComment(repoFullName, prNumber, reply, token);
}

/**
 * Handle a pull_request_review_comment event (line comment).
 */
export async function handleReviewComment(body: any): Promise<void> {
  const action = body.action;
  if (action !== "created") return;

  const comment = body.comment;
  const commentBody: string = comment?.body || "";
  if (!MENTION_REGEX.test(commentBody)) return;

  const repoFullName: string = body.repository?.full_name;
  const prNumber: number = body.pull_request?.number;
  if (!repoFullName || !prNumber) return;

  console.log(
    `[Chat] Review comment mention on ${repoFullName}#${prNumber} (${comment.path}:${comment.line})`,
  );

  const repo = await Repo.findOne({ fullName: repoFullName, isActive: true });
  if (!repo) return;

  const parsed = parseCommand(commentBody);
  if (!parsed) return;

  const user = await User.findById(repo.connectedBy);
  if (!user?.githubInstallationId) return;

  // Maintainer bypass: allow the repo owner to use chat even when prChat is off
  const senderLogin = comment.user?.login?.toLowerCase();
  const isMaintainer = senderLogin === user.username?.toLowerCase();

  if (!repo.settings.prChat && !isMaintainer) return;

  const token = await getInstallationToken(user.githubInstallationId);

  if (
    !(await checkRateLimit(
      repo._id.toString(),
      repo.settings.dailyChatLimit ?? 50,
    ))
  ) {
    await postComment(
      repoFullName,
      prNumber,
      "Daily chat limit reached for this repo.",
      token,
      comment.id,
    );
    return;
  }

  // Unrecognized or disallowed command
  if (!repo.settings.allowedCommands.includes(parsed.command)) {
    if (!VALID_COMMANDS.includes(parsed.command)) {
      const helpLines = repo.settings.allowedCommands.map(
        (cmd) => `- \`@${BOT_SLUG} ${cmd}\``,
      );
      await postComment(
        repoFullName,
        prNumber,
        `I didn't recognize that command. Here's what I can do:\n\n${helpLines.join("\n")}`,
        token,
        comment.id,
      );
    } else {
      await postComment(
        repoFullName,
        prNumber,
        `The \`${parsed.command}\` command is not enabled for this repository.`,
        token,
        comment.id,
      );
    }
    return;
  }

  // Fetch thread history — all comments in this review thread
  const threadRes = await githubAppFetch(
    `/repos/${repoFullName}/pulls/${prNumber}/comments?per_page=100`,
    token,
  );
  const allReviewComments: any[] = threadRes.ok
    ? ((await threadRes.json()) as any[])
    : [];

  // Filter to same thread (same in_reply_to_id or same comment.id chain)
  const threadId = comment.in_reply_to_id || comment.id;
  const threadComments = allReviewComments.filter(
    (c: any) => c.id === threadId || c.in_reply_to_id === threadId,
  );

  const botLogin = `${BOT_SLUG}[bot]`.toLowerCase();
  const relevant = threadComments.filter((c: any) => {
    const login = c.user?.login?.toLowerCase() || "";
    return login === senderLogin || login === botLogin;
  });

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const c of relevant.slice(-MAX_EXCHANGES * 2)) {
    const login = c.user?.login?.toLowerCase() || "";
    const role = login === botLogin ? "assistant" : "user";
    messages.push({ role, content: stripMentions(c.body) });
  }

  // Build context with file/line info
  const context = await buildChatContext(repo, prNumber, token, {
    file: comment.path,
    line: comment.line || comment.original_line,
    diffHunk: comment.diff_hunk,
  });

  let llmOptions: CallLLMOptions;
  try {
    const decryptedProviders = user.aiConfig.providers.map((p) => ({
      provider: p.provider,
      apiKey: decrypt(p.apiKey),
    }));
    const resolved = resolveProvider({
      repoAiProvider: repo.settings.aiProvider,
      repoAiModel: repo.settings.aiModel,
      userDefaultProvider: user.aiConfig.defaultProvider,
      userDefaultModel: user.aiConfig.defaultModel,
      userProviders: decryptedProviders,
    });
    llmOptions = {
      provider: resolved.provider,
      model: resolved.model,
      apiKey: resolved.apiKey,
    };
  } catch (err: any) {
    console.error(`[Chat] LLM provider error: ${err.message}`);
    return;
  }

  const reply = await generateChatReply(parsed, messages, context, llmOptions);
  await postComment(repoFullName, prNumber, reply, token, comment.id);
}

interface ChatContext {
  reviewSummary: string;
  reviewFindings: string;
  diffSnippet: string;
  fileContext: string;
  conventions: string;
}

async function buildChatContext(
  repo: IRepo,
  prNumber: number,
  token: string,
  lineInfo?: { file: string; line: number; diffHunk?: string },
): Promise<ChatContext> {
  const ctx: ChatContext = {
    reviewSummary: "",
    reviewFindings: "",
    diffSnippet: "",
    fileContext: "",
    conventions: "",
  };

  // Get PR + latest review
  const pr = await PR.findOne({ repoId: repo._id, prNumber }).lean();
  if (pr) {
    const review = await Review.findOne({ prId: pr._id })
      .sort({ createdAt: -1 })
      .lean();
    if (review) {
      ctx.reviewSummary = `Verdict: ${review.overallVerdict} (${review.confidenceScore}% confidence)\n${review.finalSummary}`;
      const findings: string[] = [];
      for (const report of review.agentReports || []) {
        if (
          report.agentType === "reviewer" ||
          report.agentType === "synthesizer"
        )
          continue;
        for (const f of report.findings || []) {
          findings.push(`[${f.severity}] ${f.file}:${f.line} — ${f.message}`);
        }
      }
      ctx.reviewFindings = findings.slice(0, 20).join("\n");
    }
  }

  // Fetch diff (truncated)
  try {
    const diffRes = await githubAppFetch(
      `/repos/${repo.fullName}/pulls/${prNumber}`,
      token,
      { headers: { Accept: "application/vnd.github.diff" } },
    );
    if (diffRes.ok) {
      const rawDiff = await diffRes.text();
      ctx.diffSnippet = rawDiff.slice(0, 8000);
    }
  } catch {
    /* ignore */
  }

  // Line-specific context
  if (lineInfo?.file) {
    if (lineInfo.diffHunk) {
      ctx.fileContext = `File: ${lineInfo.file}:${lineInfo.line}\nDiff hunk:\n${lineInfo.diffHunk}`;
    }

    // Fetch file content around the line
    try {
      const fileRes = await githubAppFetch(
        `/repos/${repo.fullName}/contents/${lineInfo.file}?ref=${pr?.headSha || "HEAD"}`,
        token,
      );
      if (fileRes.ok) {
        const fileData = (await fileRes.json()) as {
          content?: string;
          encoding?: string;
        };
        if (fileData.content && fileData.encoding === "base64") {
          const content = Buffer.from(fileData.content, "base64").toString(
            "utf8",
          );
          const lines = content.split("\n");
          const start = Math.max(0, lineInfo.line - CONTEXT_LINES - 1);
          const end = Math.min(lines.length, lineInfo.line + CONTEXT_LINES);
          const snippet = lines
            .slice(start, end)
            .map((l, i) => {
              const lineNum = start + i + 1;
              const marker = lineNum === lineInfo.line ? ">>>" : "   ";
              return `${marker} ${lineNum}: ${l}`;
            })
            .join("\n");
          ctx.fileContext += `\n\nFile content (${lineInfo.file}:${start + 1}-${end}):\n${snippet}`;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Repo conventions
  const repoCtx = await RepoContext.findOne({ repoId: repo._id })
    .select("conventions")
    .lean();
  if (repoCtx?.conventions?.length) {
    ctx.conventions = repoCtx.conventions.slice(0, 10).join("\n");
  }

  return ctx;
}

const COMMAND_SYSTEM_PROMPTS: Record<string, string> = {
  explain: `You are LGTM (Looks Good To Meow), an AI code review assistant. The user is asking you to explain code or a review finding. Be clear, concise, and technical. If they asked a specific question, answer it directly. If no question, explain the code/finding in context. Use markdown formatting.`,
  fix: `You are LGTM (Looks Good To Meow), an AI code review assistant. The user wants a fix suggestion. Provide a concrete code fix in a fenced code block with the correct language tag. Explain what the fix does and why. If the user provided constraints, respect them. Do NOT create branches or PRs — suggestion only.`,
  improve: `You are LGTM (Looks Good To Meow), an AI code review assistant. The user wants improvement suggestions beyond the specific flagged issue. Suggest broader improvements: refactoring, patterns, performance, readability. Be actionable and specific. Use code blocks where helpful.`,
  test: `You are LGTM (Looks Good To Meow), an AI code review assistant. The user wants test suggestions. Suggest unit tests for the changed code. Include test code in fenced code blocks. Cover edge cases, error paths, and the happy path. If the user specified a focus, prioritize that.`,
};

async function generateChatReply(
  parsed: ParsedCommand,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  context: ChatContext,
  llmOptions: CallLLMOptions,
): Promise<string> {
  const systemPrompt =
    COMMAND_SYSTEM_PROMPTS[parsed.command] || COMMAND_SYSTEM_PROMPTS.explain;

  // Build the prompt
  let prompt = "";

  if (context.reviewSummary) {
    prompt += `## Existing Review\n${context.reviewSummary}\n\n`;
  }
  if (context.reviewFindings) {
    prompt += `## Review Findings\n${context.reviewFindings}\n\n`;
  }
  if (context.fileContext) {
    prompt += `## File Context\n${context.fileContext}\n\n`;
  }
  if (context.diffSnippet) {
    prompt += `## PR Diff (truncated)\n\`\`\`diff\n${context.diffSnippet.slice(0, 4000)}\n\`\`\`\n\n`;
  }
  if (context.conventions) {
    prompt += `## Repo Conventions\n${context.conventions}\n\n`;
  }

  // Conversation history
  if (history.length > 0) {
    prompt += `## Conversation History\n`;
    for (const msg of history) {
      const label = msg.role === "user" ? "User" : "LGTM";
      prompt += `**${label}:** ${msg.content}\n\n`;
    }
  }

  // Current command
  prompt += `## Current Command\nCommand: ${parsed.command}\n`;
  if (parsed.message) {
    prompt += `User message: ${parsed.message}\n`;
  }
  prompt += `\nRespond to the user's ${parsed.command} request. Be helpful, concise, and use markdown formatting. Keep your response under 1500 characters when possible.`;

  try {
    const response = await callLLM(prompt, {
      ...llmOptions,
      systemPrompt,
      maxTokens: 2048,
      temperature: 0.4,
    });
    return response.content;
  } catch (err: any) {
    console.error(`[Chat] LLM call failed: ${err.message}`);
    return `Sorry, I encountered an error processing your request. Please try again later.`;
  }
}

/**
 * Build the chat footer for the initial review comment.
 * Only includes commands that are in the repo's allowedCommands list.
 */
export function buildChatFooter(allowedCommands: string[]): string {
  const commandDescriptions: Record<string, string> = {
    explain: `\`@${BOT_SLUG} explain [your question]\``,
    fix: `\`@${BOT_SLUG} fix [any constraints]\``,
    improve: `\`@${BOT_SLUG} improve [focus area]\``,
    test: `\`@${BOT_SLUG} test [what to focus on]\``,
  };

  const lines = allowedCommands
    .filter((cmd) => commandDescriptions[cmd])
    .map((cmd) => `- ${commandDescriptions[cmd]}`);

  if (lines.length === 0) return "";

  return `\n\n---\n:speech_balloon: You can interact with me directly in this PR:\n${lines.join("\n")}`;
}
