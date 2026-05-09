/**
 * n8n Review API service
 * Handles SSE streaming from the webhook endpoint
 */

const BASE = import.meta.env.VITE_API_URL || (window.location.hostname === "localhost" ? "http://localhost:3000" : "https://nmithacks.onrender.com");

export interface AgentFinding {
  file: string;
  line?: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  message: string;
  suggestion?: string;
}

export interface N8nReviewResult {
  reviewId: string;
  score: number;
  verdict: "approve" | "request_changes" | "comment";
  summary: string;
  confidenceScore: number;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  topActions: string[];
  security: AgentFinding[];
  bugs: AgentFinding[];
  performance: AgentFinding[];
  readability: AgentFinding[];
  bestPractices: AgentFinding[];
  documentation: AgentFinding[];
  totalFindings: number;
  createdAt: string;
}

export type N8nSSEEvent =
  | { type: "review:started"; data: { reviewId: string; agents: string[] } }
  | { type: "agents:running"; data: { count: number } }
  | { type: "agent:started"; data: { reviewId: string; agentType: string } }
  | {
      type: "agent:completed";
      data: {
        reviewId: string;
        agentType: string;
        findingsCount: number;
        durationMs: number;
      };
    }
  | { type: "synthesizer:started"; data: { reviewId: string } }
  | { type: "review:completed"; data: N8nReviewResult }
  | { type: "error"; data: { message: string } };

export function triggerN8nReview(
  payload: { code: string; language?: string; filename?: string; context?: string },
  onEvent: (event: N8nSSEEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE}/api/n8n/webhook/review-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        onError(`Server returned ${res.status}`);
        onDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const chunk of parts) {
          const lines = chunk.split("\n");
          let eventType = "";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }

          if (eventType && dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              onEvent({ type: eventType as any, data: parsed });
            } catch {
              /* malformed chunk */
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        onError(err.message);
      }
    }
    onDone();
  })();

  return () => controller.abort();
}

export async function fetchN8nReview(id: string): Promise<N8nReviewResult> {
  const res = await fetch(`${BASE}/api/n8n/review/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch review ${id}`);
  return res.json();
}
