import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./queue.connection', () => ({
  getQueueConnection: vi.fn(() => ({} as unknown)),
}));

const addMock = vi.fn().mockResolvedValue({ id: 'job-1' });
const closeMock = vi.fn().mockResolvedValue(undefined);
const getJobMock = vi.fn().mockResolvedValue(null);

vi.mock('bullmq', () => {
  return {
    Queue: vi.fn(function Queue() {
      return { add: addMock, close: closeMock, getJob: getJobMock };
    }),
  };
});

import { Queue } from 'bullmq';
import {
  BALANCE_SYNC_QUEUE,
  buildBalanceSyncJobId,
  enqueueBalanceSync,
  getBalanceSyncQueue,
  closeBalanceSyncQueue,
} from './balance-sync.queue';

describe('balance-sync.queue', () => {
  beforeEach(async () => {
    await closeBalanceSyncQueue();
    addMock.mockClear();
    closeMock.mockClear();
    getJobMock.mockClear();
    getJobMock.mockResolvedValue(null);
    vi.mocked(Queue).mockClear();
  });

  it('constructs queue with expected defaults exactly once', () => {
    getBalanceSyncQueue();
    getBalanceSyncQueue();

    expect(Queue).toHaveBeenCalledTimes(1);
    const args = vi.mocked(Queue).mock.calls[0];
    expect(args[0]).toBe(BALANCE_SYNC_QUEUE);
    expect(args[1]?.defaultJobOptions).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    });
  });

  it('enqueues with deterministic jobId based on chain+address', async () => {
    const ok = await enqueueBalanceSync({ chain: 'ethereum', address: '0xABC' });

    expect(ok).toBe(true);
    expect(addMock).toHaveBeenCalledTimes(1);
    const [name, data, opts] = addMock.mock.calls[0];
    expect(name).toBe('sync');
    expect(data).toEqual({ chain: 'ethereum', address: '0xabc' });
    expect(opts).toEqual({ jobId: buildBalanceSyncJobId('ethereum', '0xabc') });
  });

  it('skips add when an in-flight job already exists', async () => {
    getJobMock.mockResolvedValueOnce({
      getState: vi.fn().mockResolvedValue('waiting'),
      remove: vi.fn(),
    });

    const ok = await enqueueBalanceSync({ chain: 'ethereum', address: '0xabc' });

    expect(ok).toBe(true);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('removes a terminal job and re-enqueues', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    getJobMock.mockResolvedValueOnce({
      getState: vi.fn().mockResolvedValue('completed'),
      remove,
    });

    const ok = await enqueueBalanceSync({ chain: 'ethereum', address: '0xabc' });

    expect(ok).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledTimes(1);
  });

  it('returns false and warns instead of throwing on Redis errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    addMock.mockRejectedValueOnce(new Error('redis down'));

    const ok = await enqueueBalanceSync({ chain: 'ethereum', address: '0xabc' });

    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
