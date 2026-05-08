/**
 * Test helper: invoke the security worker's job processor with a fake
 * BullMQ Job so tests don't need a real queue.
 *
 * Lives under __tests__/helpers so production code never imports it.
 */
import type { Job } from "bullmq";
import {
  processSecurityJob,
  type SecurityJobData,
} from "../../jobs/security.job";

export async function processSecurityJobForTest(
  data: SecurityJobData,
): Promise<void> {
  const job = {
    id: "test-job",
    name: "security-scan",
    data,
    updateProgress: async () => {},
    log: async () => {},
  } as unknown as Job<SecurityJobData>;
  await processSecurityJob(job);
}
