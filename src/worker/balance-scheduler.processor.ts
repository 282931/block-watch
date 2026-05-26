import type { Job } from 'bullmq';
import { WalletRepository } from '@/server/wallet/wallet.repository';
import { enqueueBalanceSync } from '@/server/queue/balance-sync.queue';
import type { BalanceSchedulerJobData } from '@/server/queue/balance-scheduler.queue';

// Only refresh wallets that someone has actually looked at in the last week.
// Anything colder than this is treated as inactive and left alone until the
// next read warms it back up.
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type SchedulerDeps = {
  repo?: WalletRepository;
  enqueue?: (data: { chain: string; address: string }) => Promise<boolean>;
  /** Override the 7-day default, mainly so tests can pin the cutoff. */
  activeWindowMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
};

export type SchedulerResult = {
  total: number;
  enqueued: number;
};

/**
 * Fan-out processor: pull every distinct wallet (chain, address) and push a
 * balance-sync job for each one. The downstream queue de-dupes by jobId, so
 * if a previous tick is still in flight nothing gets doubled up.
 */
export function createBalanceSchedulerProcessor(deps: SchedulerDeps = {}) {
  const repo = deps.repo ?? new WalletRepository();
  const enqueue = deps.enqueue ?? enqueueBalanceSync;
  const activeWindowMs = deps.activeWindowMs ?? ACTIVE_WINDOW_MS;
  const now = deps.now ?? (() => new Date());

  return async function processBalanceScheduler(
    _job: Job<BalanceSchedulerJobData>,
  ): Promise<SchedulerResult> {
    const cutoff = new Date(now().getTime() - activeWindowMs);
    const wallets = await repo.findAllDistinctAddresses(cutoff);

    let enqueued = 0;
    for (const { chain, address } of wallets) {
      const ok = await enqueue({ chain, address });
      if (ok) enqueued += 1;
    }

    return { total: wallets.length, enqueued };
  };
}
