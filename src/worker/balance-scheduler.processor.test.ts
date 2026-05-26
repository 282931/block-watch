import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { BalanceSchedulerJobData } from '@/server/queue/balance-scheduler.queue';

vi.mock('@/server/wallet/wallet.repository', () => {
  const MockRepo = vi.fn();
  MockRepo.prototype.findAllDistinctAddresses = vi.fn();
  return { WalletRepository: MockRepo };
});

vi.mock('@/server/queue/balance-sync.queue', () => ({
  enqueueBalanceSync: vi.fn().mockResolvedValue(true),
}));

import { WalletRepository } from '@/server/wallet/wallet.repository';
import { enqueueBalanceSync } from '@/server/queue/balance-sync.queue';
import { createBalanceSchedulerProcessor } from './balance-scheduler.processor';

function makeJob(): Job<BalanceSchedulerJobData> {
  return { id: 'tick-1', data: {} } as unknown as Job<BalanceSchedulerJobData>;
}

describe('balance-scheduler processor', () => {
  let repo: WalletRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new WalletRepository();
  });

  it('enqueues a sync job for every distinct wallet', async () => {
    vi.mocked(repo.findAllDistinctAddresses).mockResolvedValue([
      { chain: 'ethereum', address: '0xaaa' },
      { chain: 'ethereum', address: '0xbbb' },
    ]);

    const fixedNow = new Date('2024-06-08T00:00:00Z');
    const processor = createBalanceSchedulerProcessor({ repo, now: () => fixedNow });
    const result = await processor(makeJob());

    const expectedCutoff = new Date(fixedNow.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(repo.findAllDistinctAddresses).toHaveBeenCalledWith(expectedCutoff);

    expect(enqueueBalanceSync).toHaveBeenCalledTimes(2);
    expect(enqueueBalanceSync).toHaveBeenNthCalledWith(1, { chain: 'ethereum', address: '0xaaa' });
    expect(enqueueBalanceSync).toHaveBeenNthCalledWith(2, { chain: 'ethereum', address: '0xbbb' });
    expect(result).toEqual({ total: 2, enqueued: 2 });
  });

  it('only counts successful enqueues', async () => {
    vi.mocked(repo.findAllDistinctAddresses).mockResolvedValue([
      { chain: 'ethereum', address: '0xaaa' },
      { chain: 'ethereum', address: '0xbbb' },
    ]);
    const enqueue = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const processor = createBalanceSchedulerProcessor({ repo, enqueue });
    const result = await processor(makeJob());

    expect(result).toEqual({ total: 2, enqueued: 1 });
  });

  it('handles empty wallet set gracefully', async () => {
    vi.mocked(repo.findAllDistinctAddresses).mockResolvedValue([]);

    const processor = createBalanceSchedulerProcessor({ repo });
    const result = await processor(makeJob());

    expect(enqueueBalanceSync).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 0, enqueued: 0 });
  });
});
