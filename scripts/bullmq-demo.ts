/**
 * Ad-hoc demo: enqueue a single balance-sync job and inspect Redis state.
 * Run with: pnpm tsx scripts/bullmq-demo.ts
 */
import 'dotenv/config';
import {
  buildBalanceSyncJobId,
  closeBalanceSyncQueue,
  enqueueBalanceSync,
  getBalanceSyncQueue,
} from '../src/server/queue/balance-sync.queue';
import { closeQueueConnection, getQueueConnection } from '../src/server/queue/queue.connection';

const chain = 'ethereum';
// Vitalik's address — public, safe to hit Etherscan with.
const address = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

async function main() {
  const queue = getBalanceSyncQueue();
  const redis = getQueueConnection();

  // 1. Enqueue (uses the project's dedup helper).
  const ok = await enqueueBalanceSync({ chain, address });
  console.log('enqueue result:', ok);

  // 2. Look up the job by its deterministic id.
  const jobId = buildBalanceSyncJobId(chain, address);
  const job = await queue.getJob(jobId);
  console.log('job id   :', job?.id);
  console.log('job name :', job?.name);
  console.log('job data :', job?.data);
  console.log('job state:', await job?.getState());

  // 3. Peek at the raw BullMQ keys in Redis.
  const keys = await redis.keys('bull:balance-sync:*');
  console.log('redis keys (sample, up to 20):');
  for (const k of keys.slice(0, 20)) console.log('  ', k);

  // 4. Queue-level counters.
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
  );
  console.log('counts:', counts);

  await closeBalanceSyncQueue();
  await closeQueueConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
