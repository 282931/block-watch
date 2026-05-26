import 'dotenv/config';
import { Worker } from 'bullmq';
import {
  BALANCE_SYNC_QUEUE,
  type BalanceSyncJobData,
  closeBalanceSyncQueue,
} from '@/server/queue/balance-sync.queue';
import {
  BALANCE_SCHEDULER_QUEUE,
  type BalanceSchedulerJobData,
  closeBalanceSchedulerQueue,
  ensureBalanceSchedulerRepeatable,
} from '@/server/queue/balance-scheduler.queue';
import { closeQueueConnection, getQueueConnection } from '@/server/queue/queue.connection';
import { createBalanceSyncProcessor } from './balance-sync.processor';
import { createBalanceSchedulerProcessor } from './balance-scheduler.processor';

const concurrency = Number.parseInt(process.env.BALANCE_SYNC_CONCURRENCY ?? '5', 10) || 5;

const syncWorker = new Worker<BalanceSyncJobData>(
  BALANCE_SYNC_QUEUE,
  createBalanceSyncProcessor(),
  {
    connection: getQueueConnection(),
    concurrency,
  },
);

syncWorker.on('completed', (job) => {
  console.log(
    `[worker:balance-sync] completed job=${job.id} address=${job.data.address}`,
  );
});

syncWorker.on('failed', (job, err) => {
  console.error(
    `[worker:balance-sync] failed job=${job?.id} address=${job?.data?.address} error=${err.message}`,
  );
});

syncWorker.on('error', (err) => {
  console.error('[worker:balance-sync] worker error:', err.message);
});

// Scheduler worker: consumes the repeatable trigger and fans out sync jobs.
// Concurrency is intentionally 1 since each tick is a quick DB scan.
const schedulerWorker = new Worker<BalanceSchedulerJobData>(
  BALANCE_SCHEDULER_QUEUE,
  createBalanceSchedulerProcessor(),
  {
    connection: getQueueConnection(),
    concurrency: 1,
  },
);

schedulerWorker.on('completed', (job, result) => {
  const r = result as { total: number; enqueued: number } | undefined;
  console.log(
    `[worker:balance-scheduler] tick job=${job.id} total=${r?.total ?? 0} enqueued=${r?.enqueued ?? 0}`,
  );
});

schedulerWorker.on('failed', (job, err) => {
  console.error(
    `[worker:balance-scheduler] failed job=${job?.id} error=${err.message}`,
  );
});

schedulerWorker.on('error', (err) => {
  console.error('[worker:balance-scheduler] worker error:', err.message);
});

// Register / refresh the cron schedule on every worker start.
ensureBalanceSchedulerRepeatable()
  .then(() => {
    console.log(
      `[worker:balance-scheduler] repeatable registered pattern=${process.env.BALANCE_SCHEDULER_CRON ?? '*/2 * * * *'}`,
    );
  })
  .catch((err) => {
    console.error('[worker:balance-scheduler] failed to register repeatable:', err.message);
  });

console.log(
  `[worker:balance-sync] listening on queue=${BALANCE_SYNC_QUEUE} concurrency=${concurrency}`,
);
console.log(
  `[worker:balance-scheduler] listening on queue=${BALANCE_SCHEDULER_QUEUE}`,
);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] received ${signal}, shutting down...`);
  try {
    await Promise.all([syncWorker.close(), schedulerWorker.close()]);
    await closeBalanceSyncQueue();
    await closeBalanceSchedulerQueue();
    await closeQueueConnection();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[worker] shutdown error:', message);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
