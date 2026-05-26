import { Queue } from 'bullmq';
import { getQueueConnection } from './queue.connection';

export const BALANCE_SYNC_QUEUE = 'balance-sync';

export type BalanceSyncJobData = {
  chain: string;
  address: string;
};

let queue: Queue<BalanceSyncJobData> | null = null;

export function getBalanceSyncQueue(): Queue<BalanceSyncJobData> {
  if (!queue) {
    queue = new Queue<BalanceSyncJobData>(BALANCE_SYNC_QUEUE, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600 },
      },
    });
  }
  return queue;
}

export function buildBalanceSyncJobId(chain: string, address: string): string {
  return `balance-sync:${chain}:${address.toLowerCase()}`;
}

/**
 * Enqueue a balance-sync job for the given chain + address.
 *
 * Uses a deterministic jobId so concurrent enqueues for the same address are
 * coalesced by BullMQ. Failures here must never break the calling web path,
 * so we log and return `false` instead of throwing.
 */
export async function enqueueBalanceSync(data: BalanceSyncJobData): Promise<boolean> {
  const chain = data.chain;
  const address = data.address.toLowerCase();
  const baseJobId = buildBalanceSyncJobId(chain, address);

  try {
    const queue = getBalanceSyncQueue();
    // De-dupe only against in-flight work: waiting / active / delayed.
    // Completed/failed jobs share the same jobId, so we'd otherwise be
    // permanently blocked after the first successful sync.
    const existing = await queue.getJob(baseJobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'waiting-children') {
        return true;
      }
      // Drop the terminal record so we can enqueue a fresh run.
      await existing.remove().catch(() => undefined);
    }

    await queue.add('sync', { chain, address }, { jobId: baseJobId });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[queue:balance-sync] enqueue failed:', message);
    return false;
  }
}

export async function closeBalanceSyncQueue(): Promise<void> {
  if (queue) {
    await queue.close().catch(() => undefined);
    queue = null;
  }
}
