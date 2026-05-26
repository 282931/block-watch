import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletService } from './wallet.service';
import { WalletRepository } from './wallet.repository';
import { AuthError, ConflictError, NotFoundError } from '@/server/lib/errors';
import type { Redis } from 'ioredis';

vi.mock('@/server/wallet/wallet.repository', () => {
  const MockRepo = vi.fn();
  MockRepo.prototype.findByUserId = vi.fn();
  MockRepo.prototype.findByIdAndUser = vi.fn();
  MockRepo.prototype.create = vi.fn();
  MockRepo.prototype.deleteByIdAndUser = vi.fn();
  MockRepo.prototype.existsByUserAndAddress = vi.fn();
  MockRepo.prototype.findByAddress = vi.fn();
  MockRepo.prototype.updateBalance = vi.fn();
  MockRepo.prototype.touchLastAccessed = vi.fn().mockResolvedValue(undefined);
  return { WalletRepository: MockRepo };
});

import * as redisModule from '@/server/lib/redis';

vi.mock('@/server/lib/redis', () => ({
  withRedis: vi.fn(),
  BALANCE_CACHE_TTL: 30,
  buildBalanceCacheKey: (chain: string, address: string) =>
    `wallet:balance:${chain}:${address.toLowerCase()}`,
}));

vi.mock('@/server/queue/balance-sync.queue', () => ({
  enqueueBalanceSync: vi.fn().mockResolvedValue(true),
}));

import { enqueueBalanceSync } from '@/server/queue/balance-sync.queue';

describe('WalletService', () => {
  let service: WalletService;
  let mockRepo: WalletRepository;
  let enqueue: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = new WalletRepository();
    enqueue = vi.fn(async () => true);
    service = new WalletService(mockRepo, enqueue as unknown as (data: { chain: string; address: string }) => Promise<boolean>);
  });

  describe('listWallets', () => {
    it('should return wallets for authenticated user', async () => {
      const wallets = [
        {
          id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null,
          createdAt: new Date(), balanceEth: null, balanceWei: null, balanceUpdatedAt: null,
        },
      ];
      vi.mocked(mockRepo.findByUserId).mockResolvedValue(wallets);

      const result = await service.listWallets('u1');

      expect(mockRepo.findByUserId).toHaveBeenCalledWith('u1');
      expect(result).toEqual([{ ...wallets[0], balanceEth: undefined, balanceWei: undefined, balanceUpdatedAt: undefined }]);
    });

    it('should throw AuthError when userId is empty', async () => {
      await expect(service.listWallets('')).rejects.toThrow(AuthError);
      await expect(service.listWallets('')).rejects.toThrow('Please log in to view wallets.');
    });
  });

  describe('addWallet', () => {
    const validInput = { address: '0xABC', label: undefined };

    it('should create wallet and enqueue balance-sync job', async () => {
      const created = {
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null,
        createdAt: new Date(), balanceEth: null, balanceWei: null, balanceUpdatedAt: null,
      };
      vi.mocked(mockRepo.existsByUserAndAddress).mockResolvedValue(false);
      vi.mocked(mockRepo.create).mockResolvedValue(created);

      const result = await service.addWallet('u1', validInput);

      expect(mockRepo.existsByUserAndAddress).toHaveBeenCalledWith('u1', '0xabc');
      expect(mockRepo.create).toHaveBeenCalledWith({
        userId: 'u1',
        address: '0xabc',
        chain: 'ethereum',
        label: null,
      });
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(enqueue).toHaveBeenCalledWith({ chain: 'ethereum', address: '0xabc' });
      expect(result).toEqual(created);
    });

    it('should throw AuthError when userId is empty', async () => {
      await expect(service.addWallet('', validInput)).rejects.toThrow(AuthError);
    });

    it('should throw ConflictError when address already exists', async () => {
      vi.mocked(mockRepo.existsByUserAndAddress).mockResolvedValue(true);

      await expect(service.addWallet('u1', validInput)).rejects.toThrow(ConflictError);
      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('deleteWallet', () => {
    it('should delete wallet successfully', async () => {
      const wallet = {
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null,
        createdAt: new Date(), balanceEth: null, balanceWei: null, balanceUpdatedAt: null,
      };
      vi.mocked(mockRepo.findByIdAndUser).mockResolvedValue(wallet);

      await service.deleteWallet('u1', '1');

      expect(mockRepo.findByIdAndUser).toHaveBeenCalledWith('1', 'u1');
      expect(mockRepo.deleteByIdAndUser).toHaveBeenCalledWith('1', 'u1');
    });

    it('should throw AuthError when userId is empty', async () => {
      await expect(service.deleteWallet('', '1')).rejects.toThrow(AuthError);
    });

    it('should throw NotFoundError when wallet does not exist', async () => {
      vi.mocked(mockRepo.findByIdAndUser).mockResolvedValue(null);

      await expect(service.deleteWallet('u1', 'nonexistent')).rejects.toThrow(NotFoundError);
      expect(mockRepo.deleteByIdAndUser).not.toHaveBeenCalled();
    });
  });

  describe('getBalance', () => {
    type RedisCallback = (redis: Redis) => Promise<unknown>;
    type RedisFallback = () => Promise<unknown>;

    const now = Date.now();
    const freshUpdatedAt = new Date(now - 10_000);
    const staleUpdatedAt = new Date(now - 10 * 60_000);

    function mockRedisMiss() {
      vi.mocked(redisModule.withRedis).mockImplementation(async (_fn: RedisCallback, fallback: RedisFallback) => {
        return fallback();
      });
    }

    function mockRedisHit(data: { balanceEth: string; balanceWei: string; updatedAt?: number }) {
      vi.mocked(redisModule.withRedis).mockImplementation(async (fn: RedisCallback) => {
        const updatedAt = data.updatedAt ?? Date.now();
        return fn({
          get: () => Promise.resolve(JSON.stringify({ ...data, updatedAt })),
          setex: () => Promise.resolve('OK'),
        } as unknown as Redis);
      });
    }

    it('returns fresh Redis hit and does not enqueue', async () => {
      mockRedisHit({ balanceEth: '2.0', balanceWei: '2000000000000000000' });

      const result = await service.getBalance('0xABC');

      expect(result).toEqual({ balanceEth: '2.0', balanceWei: '2000000000000000000', isStale: false });
      expect(mockRepo.findByAddress).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('returns stale Redis hit and enqueues sync', async () => {
      mockRedisHit({
        balanceEth: '2.0',
        balanceWei: '2000000000000000000',
        updatedAt: Date.now() - 10 * 60_000,
      });

      const result = await service.getBalance('0xABC');

      expect(result).toEqual({ balanceEth: '2.0', balanceWei: '2000000000000000000', isStale: true });
      expect(enqueue).toHaveBeenCalledWith({ chain: 'ethereum', address: '0xabc' });
    });

    it('falls through to fresh DB cache and does not enqueue', async () => {
      mockRedisMiss();
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: '1.5', balanceWei: '1500000000000000000', balanceUpdatedAt: freshUpdatedAt,
      });

      const result = await service.getBalance('0xABC');

      expect(mockRepo.findByAddress).toHaveBeenCalledWith('0xabc');
      expect(result).toEqual({ balanceEth: '1.5', balanceWei: '1500000000000000000', isStale: false });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('returns stale DB value and enqueues sync', async () => {
      mockRedisMiss();
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: '1.5', balanceWei: '1500000000000000000', balanceUpdatedAt: staleUpdatedAt,
      });

      const result = await service.getBalance('0xABC');

      expect(result).toEqual({ balanceEth: '1.5', balanceWei: '1500000000000000000', isStale: true });
      expect(enqueue).toHaveBeenCalledWith({ chain: 'ethereum', address: '0xabc' });
    });

    it('returns null and enqueues sync when no cache exists at all', async () => {
      mockRedisMiss();
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: null, balanceWei: null, balanceUpdatedAt: null,
      });

      const result = await service.getBalance('0xABC');

      expect(result).toBeNull();
      expect(enqueue).toHaveBeenCalledWith({ chain: 'ethereum', address: '0xabc' });
    });
  });

  it('module-level enqueueBalanceSync import is still mockable', () => {
    expect(vi.isMockFunction(enqueueBalanceSync)).toBe(true);
  });
});
