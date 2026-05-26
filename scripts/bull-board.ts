/**
 * Bull Board dashboard for inspecting BullMQ queues.
 *
 * Run with: pnpm board   (or pnpm dev:board for auto-reload)
 * Then open: http://localhost:3001/admin/queues
 *
 * This is a dev/ops tool — it stands up its own Express server and is NOT
 * mounted into the Next.js app. Don't expose it publicly without auth.
 */
import 'dotenv/config';
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { getBalanceSyncQueue, closeBalanceSyncQueue } from '../src/server/queue/balance-sync.queue';
import {
  getBalanceSchedulerQueue,
  closeBalanceSchedulerQueue,
} from '../src/server/queue/balance-scheduler.queue';
import { closeQueueConnection } from '../src/server/queue/queue.connection';

const PORT = Number.parseInt(process.env.BOARD_PORT ?? '3001', 10) || 3001;
const BASE_PATH = '/admin/queues';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(BASE_PATH);

createBullBoard({
  queues: [
    new BullMQAdapter(getBalanceSyncQueue()),
    new BullMQAdapter(getBalanceSchedulerQueue()),
  ],
  serverAdapter,
});

const app = express();
app.use(BASE_PATH, serverAdapter.getRouter());

const server = app.listen(PORT, () => {
  console.log(`[bull-board] listening on http://localhost:${PORT}${BASE_PATH}`);
});

async function shutdown(signal: string) {
  console.log(`[bull-board] received ${signal}, shutting down...`);
  server.close();
  await closeBalanceSyncQueue();
  await closeBalanceSchedulerQueue();
  await closeQueueConnection();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
