import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletService } from './wallet.service';
import { WalletRepository } from './wallet.repository';
import { AuthError, ConflictError, NotFoundError, RateLimitError } from '@/server/lib/errors';

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

const mockRedisGet = vi.fn();
const mockRedisSetex = vi.fn();

vi.mock('@/server/lib/redis', () => ({
  getRedis: vi.fn(),
  withRedis: vi.fn(),
  BALANCE_CACHE_TTL: 30,
  BALANCE_CACHE_PREFIX: 'wallet:balance',
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
      const wallets = [{ id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date() }];
      vi.mocked(mockRepo.findByUserId).mockResolvedValue(wallets);

      const result = await service.listWallets('u1');

      expect(mockRepo.findByUserId).toHaveBeenCalledWith('u1');
      expect(result).toEqual(wallets);
    });

    it('should throw AuthError when userId is empty', async () => {
      await expect(service.listWallets('')).rejects.toThrow(AuthError);
      await expect(service.listWallets('')).rejects.toThrow('Please log in to view wallets.');
    });
  });

  describe('addWallet', () => {
    const validInput = { address: '0xabc', label: undefined };

    it('should create wallet successfully', async () => {
      const created = { id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date() };
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
      const wallet = { id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date() };
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
    const now = Date.now();
    const freshUpdatedAt = new Date(now - 10_000); // 10s ago (within 30s window)
    const staleUpdatedAt = new Date(now - 60_000); // 60s ago (> 30s, stale)

    function mockRedisMiss() {
      vi.mocked(redisModule.withRedis).mockImplementation(async (_fn: Function, fallback: Function) => {
        return fallback();
      });
    }

    function mockRedisHit(data: { balanceEth: string; balanceWei: string }) {
      vi.mocked(redisModule.withRedis).mockImplementation(async (fn: Function, _fallback: Function) => {
        return fn({ get: () => Promise.resolve(JSON.stringify({ ...data, updatedAt: Date.now() })) });
      });
    }

    it('should return from Redis when cache is hot', async () => {
      mockRedisHit({ balanceEth: '2.0', balanceWei: '2000000000000000000' });

      const result = await service.getBalance('0xabc');

      expect(result).toEqual({ balanceEth: '2.0', balanceWei: '2000000000000000000' });
      expect(mockRepo.findByAddress).not.toHaveBeenCalled();
    });

    it('should fall through to DB when Redis misses', async () => {
      mockRedisMiss();
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: '1.5', balanceWei: '1500000000000000000', balanceUpdatedAt: freshUpdatedAt,
      });

      const result = await service.getBalance('0xabc');

      expect(mockRepo.findByAddress).toHaveBeenCalledWith('0xabc');
      expect(result).toEqual({ balanceEth: '1.5', balanceWei: '1500000000000000000' });
    });

    it('should return stale cache and trigger background refresh when cache is stale', async () => {
      mockRedisMiss();
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: '1.5', balanceWei: '1500000000000000000', balanceUpdatedAt: staleUpdatedAt,
      });

      const result = await service.getBalance('0xabc');

      expect(result).toEqual({ balanceEth: '1.5', balanceWei: '1500000000000000000' });
    });

    it('should fetch from RPC when no cache exists', async () => {
      mockRedisMiss();
      vi.mocked(mockRepo.findByAddress).mockResolvedValue({
        id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: new Date(),
        balanceEth: null, balanceWei: null, balanceUpdatedAt: null,
      });

      const getBalance = vi.fn().mockResolvedValue(BigInt('1234567890000000000'));
      service = new WalletService(mockRepo, () => ({ getBalance }));

      const result = await service.getBalance('0xabc');

      expect(getBalance).toHaveBeenCalledWith('0xabc');
      expect(mockRepo.updateBalance).toHaveBeenCalledWith('0xabc', {
        balanceWei: '1234567890000000000',
        balanceEth: '1.234567',
      });
      expect(result).toEqual({
        balanceWei: '1234567890000000000',
        balanceEth: '1.234567',
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

      await expect(service.getBalance('0xabc')).rejects.toThrow(RateLimitError);
      await expect(service.getBalance('0xabc')).rejects.toThrow('Could not reach the Ethereum RPC endpoint.');
    });
  });
});
