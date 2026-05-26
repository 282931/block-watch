import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { RateLimitError, ServerError } from '@/server/lib/errors';
import type { BalanceSyncJobData } from '@/server/queue/balance-sync.queue';

vi.mock('@/server/wallet/wallet.repository', () => {
  const MockRepo = vi.fn();
  MockRepo.prototype.updateBalance = vi.fn().mockResolvedValue(undefined);
  return { WalletRepository: MockRepo };
});

vi.mock('@/server/lib/redis', () => ({
  withRedis: vi.fn(async (fn: (r: unknown) => Promise<unknown>, fallback: () => Promise<unknown>) => {
    try {
      return await fn({ setex: vi.fn().mockResolvedValue('OK') });
    } catch {
      return fallback();
    }
  }),
  BALANCE_CACHE_TTL: 30,
  buildBalanceCacheKey: (chain: string, address: string) =>
    `wallet:balance:${chain}:${address.toLowerCase()}`,
}));

import { WalletRepository } from '@/server/wallet/wallet.repository';
import { withRedis } from '@/server/lib/redis';
import { createBalanceSyncProcessor, resetProviderCache } from './balance-sync.processor';

function makeJob(data: BalanceSyncJobData): Job<BalanceSyncJobData> {
  return { id: 'job-1', data } as unknown as Job<BalanceSyncJobData>;
}

describe('balance-sync processor', () => {
  let repo: WalletRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    resetProviderCache();
    repo = new WalletRepository();
  });

  it('writes balance to DB and Redis on success', async () => {
    const getBalance = vi.fn().mockResolvedValue(BigInt('1234567890000000000'));
    const processor = createBalanceSyncProcessor({
      repo,
      providerFactory: () => ({ getBalance }),
    });

    const result = await processor(makeJob({ chain: 'ethereum', address: '0xABC' }));

    expect(getBalance).toHaveBeenCalledWith('0xabc');
    expect(repo.updateBalance).toHaveBeenCalledWith('0xabc', {
      balanceEth: '1.234567',
      balanceWei: '1234567890000000000',
    });
    expect(withRedis).toHaveBeenCalled();
    expect(result).toEqual({ balanceEth: '1.234567', balanceWei: '1234567890000000000' });
  });

  it('throws RateLimitError on provider failure so BullMQ retries', async () => {
    const getBalance = vi.fn().mockRejectedValue(new Error('rpc down'));
    const processor = createBalanceSyncProcessor({
      repo,
      providerFactory: () => ({ getBalance }),
    });

    await expect(
      processor(makeJob({ chain: 'ethereum', address: '0xabc' })),
    ).rejects.toThrow(RateLimitError);
    expect(repo.updateBalance).not.toHaveBeenCalled();
  });

  it('throws ServerError when provider factory cannot create a provider', async () => {
    const processor = createBalanceSyncProcessor({
      repo,
      providerFactory: () => {
        throw new ServerError('Missing ETHERSCAN_API_KEY for balance-sync worker.');
      },
    });

    await expect(
      processor(makeJob({ chain: 'ethereum', address: '0xabc' })),
    ).rejects.toThrow(ServerError);
    expect(repo.updateBalance).not.toHaveBeenCalled();
  });
});
