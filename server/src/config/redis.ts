import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.warn("[Redis] REDIS_URL is not set — queues will not work");
}

export const redis = redisUrl
  ? new IORedis(redisUrl, { maxRetriesPerRequest: null })
  : (null as unknown as IORedis);
