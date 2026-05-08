/**
 * BullMQ Queue setup with proper Redis connection config.
 *
 * Fixes:
 * - maxRetriesPerRequest: null on all connections (required by BullMQ)
 * - Proper null typing (no unsafe casts)
 * - Shared connection config factory
 * - Queue error listeners for Redis health monitoring
 */
import { Queue, type ConnectionOptions } from "bullmq";

const redisUrl = process.env.REDIS_URL;

/**
 * Shared Redis connection options.
 * maxRetriesPerRequest: null is REQUIRED by BullMQ for both queues and workers.
 */
export function getRedisConnection(): ConnectionOptions | null {
  if (!redisUrl) return null;
  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
  };
}

const connection = getRedisConnection();

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};

function createQueue(name: string): Queue | null {
  if (!connection) return null;

  const queue = new Queue(name, {
    connection,
    defaultJobOptions,
  });

  queue.on("error", (err) => {
    console.error(`[Queue:${name}] Redis error:`, err.message);
  });

  return queue;
}

export const contextQueue: Queue | null = createQueue("context");
export const reviewQueue: Queue | null = createQueue("review");
export const securityQueue: Queue | null = createQueue("security");

/**
 * Helper to get a queue or throw a clear 503 error.
 * Use in controllers to avoid scattered null checks.
 */
export function getQueueOrThrow(
  name: "context" | "review" | "security",
): Queue {
  const queue =
    name === "context"
      ? contextQueue
      : name === "review"
        ? reviewQueue
        : securityQueue;
  if (!queue) {
    const err = new Error(
      `${name} queue not available (Redis not connected)`,
    ) as any;
    err.statusCode = 503;
    throw err;
  }
  return queue;
}
