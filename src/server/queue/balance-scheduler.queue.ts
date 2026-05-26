import { Queue } from 'bullmq';
import { getQueueConnection } from './queue.connection';

export const BALANCE_SCHEDULER_QUEUE = 'balance-scheduler';

export type BalanceSchedulerJobData = Record<string, never>;

let queue: Queue<BalanceSchedulerJobData> | null = null;

export function getBalanceSchedulerQueue(): Queue<BalanceSchedulerJobData> {
  if (!queue) {
    queue = new Queue<BalanceSchedulerJobData>(BALANCE_SCHEDULER_QUEUE, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 24 * 3600 },
      },
    });
  }
  return queue;
}

/**
 * Ensure the repeatable "refresh-all" job is registered.
 *
 * Call this on worker startup. Idempotent — BullMQ ignores duplicate
 * repeatable keys, so calling it multiple times is safe.
 */
export async function ensureBalanceSchedulerRepeatable(
  cronPattern = process.env.BALANCE_SCHEDULER_CRON ?? '*/2 * * * *',
): Promise<void> {
  await getBalanceSchedulerQueue().add(
    'refresh-all',
    {},
    {
      repeat: { pattern: cronPattern },
      jobId: 'balance-scheduler:refresh-all',
    },
  );
}

export async function closeBalanceSchedulerQueue(): Promise<void> {
  if (queue) {
    await queue.close().catch(() => undefined);
    queue = null;
  }
}
