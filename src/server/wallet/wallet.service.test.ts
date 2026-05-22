import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletService } from './wallet.service';
import { WalletRepository } from './wallet.repository';
import { AuthError, ConflictError, NotFoundError, RateLimitError } from '@/server/lib/errors';
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
  return { WalletRepository: MockRepo };
});

import * as redisModule from '@/server/lib/redis';

vi.mock('@/server/lib/redis', () => ({
  withRedis: vi.fn(),
  BALANCE_CACHE_TTL: 30,
  BALANCE_REFRESH_LOCK_TTL: 10,
  buildBalanceCacheKey: (chain: string, address: string) => `wallet:balance:${chain}:${address.toLowerCase()}`,
  buildBalanceRefreshLockKey: (chain: string, address: string) => `wallet:balance:refresh-lock:${chain}:${address.toLowerCase()}`,
}));

describe('WalletService', () => {
  let service: WalletService;
  let mockRepo: WalletRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = new WalletRepository();
    service = new WalletService(mockRepo);
  });

  describe('listWallets', () => {
    it('should return wallets for authenticated user', async () => {
      const wallets = [{ id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(), balanceEth: null, balanceWei: null, balanceUpdatedAt: null }];
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

    it('should create wallet successfully', async () => {
      const created = { id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(), balanceEth: null, balanceWei: null, balanceUpdatedAt: null };
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
      expect(result).toEqual(created);
    });

    it('should throw AuthError when userId is empty', async () => {
      await expect(service.addWallet('', validInput)).rejects.toThrow(AuthError);
    });

    it('should throw ConflictError when address already exists', async () => {
      vi.mocked(mockRepo.existsByUserAndAddress).mockResolvedValue(true);

      await expect(service.addWallet('u1', validInput)).rejects.toThrow(ConflictError);
      await expect(service.addWallet('u1', validInput)).rejects.toThrow('This wallet address is already in your list.');
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteWallet', () => {
    it('should delete wallet successfully', async () => {
      const wallet = { id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(), balanceEth: null, balanceWei: null, balanceUpdatedAt: null };
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
      await expect(service.deleteWallet('u1', 'nonexistent')).rejects.toThrow('Wallet address not found.');
      expect(mockRepo.deleteByIdAndUser).not.toHaveBeenCalled();
    });
  });

  describe('getBalance', () => {
    type RedisCallback = (redis: Redis) => Promise<unknown>;
    type RedisFallback = () => Promise<unknown>;

    const now = Date.now();
    const freshUpdatedAt = new Date(now - 10_000);
    const staleUpdatedAt = new Date(now - 60_000);

    function mockRedisMiss() {
      vi.mocked(redisModule.withRedis).mockImplementation(async (_fn: RedisCallback, fallback: RedisFallback) => {
        return fallback();
      });
    }

    function mockRedisHit(data: { balanceEth: string; balanceWei: string }) {
      vi.mocked(redisModule.withRedis).mockImplementation(async (fn: RedisCallback) => {
        return fn({ get: () => Promise.resolve(JSON.stringify({ ...data, updatedAt: Date.now() })) } as unknown as Redis);
      });
    }

    it('should return from Redis when cache is hot', async () => {
      mockRedisHit({ balanceEth: '2.0', balanceWei: '2000000000000000000' });

      const result = await service.getBalance('0xABC');

      expect(result).toEqual({ balanceEth: '2.0', balanceWei: '2000000000000000000', isStale: false });
      expect(mockRepo.findByAddress).not.toHaveBeenCalled();
    });

    it('should fall through to DB when Redis misses', async () => {
      mockRedisMiss();
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: '1.5', balanceWei: '1500000000000000000', balanceUpdatedAt: freshUpdatedAt,
      });

      const result = await service.getBalance('0xABC');

      expect(mockRepo.findByAddress).toHaveBeenCalledWith('0xabc');
      expect(result).toEqual({ balanceEth: '1.5', balanceWei: '1500000000000000000', isStale: false });
    });

    it('should return stale DB cache without fetching when reading cached balance', async () => {
      mockRedisMiss();
      const getBalance = vi.fn().mockResolvedValue(BigInt('1234567890000000000'));
      service = new WalletService(mockRepo, () => ({ getBalance }));
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: '1.5', balanceWei: '1500000000000000000', balanceUpdatedAt: staleUpdatedAt,
      });

      const result = await service.getCachedBalance('0xABC');

      expect(result).toEqual({ balanceEth: '1.5', balanceWei: '1500000000000000000', isStale: true });
      expect(getBalance).not.toHaveBeenCalled();
    });

    it('should fetch from RPC when stale balance refresh lock is acquired', async () => {
      const set = vi.fn().mockResolvedValue('OK');
      vi.mocked(redisModule.withRedis).mockImplementation(async (fn: RedisCallback, fallback: RedisFallback) => {
        const redis = {
          get: () => Promise.resolve(null),
          set,
          setex: () => Promise.resolve('OK'),
        };
        return fn(redis as unknown as Redis).catch(() => fallback());
      });
      const getBalance = vi.fn().mockResolvedValue(BigInt('1234567890000000000'));
      service = new WalletService(mockRepo, () => ({ getBalance }));
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: '1.5', balanceWei: '1500000000000000000', balanceUpdatedAt: staleUpdatedAt,
      });

      const result = await service.getBalance('0xABC');

      expect(set).toHaveBeenCalledWith('wallet:balance:refresh-lock:ethereum:0xabc', '1', 'EX', 10, 'NX');
      expect(getBalance).toHaveBeenCalledWith('0xabc');
      expect(mockRepo.updateBalance).toHaveBeenCalledWith('0xabc', {
        balanceWei: '1234567890000000000',
        balanceEth: '1.234567',
      });
      expect(result).toEqual({ balanceEth: '1.234567', balanceWei: '1234567890000000000', isStale: false });
    });

    it('should return stale cache when refresh lock is held elsewhere', async () => {
      const set = vi.fn().mockResolvedValue(null);
      vi.mocked(redisModule.withRedis).mockImplementation(async (fn: RedisCallback, fallback: RedisFallback) => {
        const redis = {
          get: () => Promise.resolve(null),
          set,
        };
        return fn(redis as unknown as Redis).catch(() => fallback());
      });
      const getBalance = vi.fn().mockResolvedValue(BigInt('1234567890000000000'));
      service = new WalletService(mockRepo, () => ({ getBalance }));
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: '1.5', balanceWei: '1500000000000000000', balanceUpdatedAt: staleUpdatedAt,
      });

      const result = await service.getBalance('0xABC');

      expect(set).toHaveBeenCalledWith('wallet:balance:refresh-lock:ethereum:0xabc', '1', 'EX', 10, 'NX');
      expect(getBalance).not.toHaveBeenCalled();
      expect(result).toEqual({ balanceEth: '1.5', balanceWei: '1500000000000000000', isStale: true });
    });

    it('should fetch from RPC when no cache exists', async () => {
      mockRedisMiss();
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: null, balanceWei: null, balanceUpdatedAt: null,
      });

      const getBalance = vi.fn().mockResolvedValue(BigInt('1234567890000000000'));
      service = new WalletService(mockRepo, () => ({ getBalance }));

      const result = await service.getBalance('0xABC');

      expect(getBalance).toHaveBeenCalledWith('0xabc');
      expect(mockRepo.updateBalance).toHaveBeenCalledWith('0xabc', {
        balanceWei: '1234567890000000000',
        balanceEth: '1.234567',
      });
      expect(result).toEqual({
        balanceWei: '1234567890000000000',
        balanceEth: '1.234567',
        isStale: false,
      });
    });

    it('should throw RateLimitError on RPC failure when no cache', async () => {
      mockRedisMiss();
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: null, balanceWei: null, balanceUpdatedAt: null,
      });

      const getBalance = vi.fn().mockRejectedValue(new Error('RPC error'));
      service = new WalletService(mockRepo, () => ({ getBalance }));

      await expect(service.getBalance('0xABC')).rejects.toThrow(RateLimitError);
      await expect(service.getBalance('0xABC')).rejects.toThrow('Could not reach the Ethereum RPC endpoint.');
    });
  });
});
