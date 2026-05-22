import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletRepository } from './wallet.repository';

// Mock prisma module
vi.mock('@/app/lib/db', () => {
  const mockPrisma = {
    walletAddress: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { default: mockPrisma };
});

import prisma from '@/app/lib/db';

const mockPrisma = prisma as unknown as {
  walletAddress: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

describe('WalletRepository', () => {
  let repo: WalletRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new WalletRepository();
  });

  describe('findByUserId', () => {
    it('should call prisma.walletAddress.findMany with correct params', async () => {
      const now = new Date();
      const mockWallets = [{ id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: now, balanceEth: '1.5', balanceWei: '1500000000000000000', balanceUpdatedAt: now }];
      mockPrisma.walletAddress.findMany.mockResolvedValue(mockWallets);

      const result = await repo.findByUserId('u1');

      expect(mockPrisma.walletAddress.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', chain: 'ethereum' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockWallets);
    });
  });

  describe('findByIdAndUser', () => {
    it('should call prisma.walletAddress.findFirst with correct params', async () => {
      const now = new Date();
      const mockWallet = { id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: now, balanceEth: null, balanceWei: null, balanceUpdatedAt: null };
      mockPrisma.walletAddress.findFirst.mockResolvedValue(mockWallet);

      const result = await repo.findByIdAndUser('1', 'u1');

      expect(mockPrisma.walletAddress.findFirst).toHaveBeenCalledWith({
        where: { id: '1', userId: 'u1' },
      });
      expect(result).toEqual(mockWallet);
    });

    it('should return null when not found', async () => {
      mockPrisma.walletAddress.findFirst.mockResolvedValue(null);

      const result = await repo.findByIdAndUser('nonexistent', 'u1');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should call prisma.walletAddress.create with correct data', async () => {
      const input = { userId: 'u1', address: '0xabc', chain: 'ethereum', label: null };
      const created = { id: '1', ...input, createdAt: new Date(), balanceEth: null, balanceWei: null, balanceUpdatedAt: null };
      mockPrisma.walletAddress.create.mockResolvedValue(created);

      const result = await repo.create(input);

      expect(mockPrisma.walletAddress.create).toHaveBeenCalledWith({ data: input });
      expect(result).toEqual(created);
    });
  });

  describe('deleteByIdAndUser', () => {
    it('should call prisma.walletAddress.deleteMany with correct params', async () => {
      mockPrisma.walletAddress.deleteMany.mockResolvedValue({ count: 1 });

      await repo.deleteByIdAndUser('1', 'u1');

      expect(mockPrisma.walletAddress.deleteMany).toHaveBeenCalledWith({
        where: { id: '1', userId: 'u1' },
      });
    });
  });

  describe('existsByUserAndAddress', () => {
    it('should return true when wallet exists', async () => {
      mockPrisma.walletAddress.findFirst.mockResolvedValue({ id: '1' });

      const result = await repo.existsByUserAndAddress('u1', '0xabc');

      expect(result).toBe(true);
    });

    it('should return false when wallet does not exist', async () => {
      mockPrisma.walletAddress.findFirst.mockResolvedValue(null);

      const result = await repo.existsByUserAndAddress('u1', '0xnonexistent');

      expect(result).toBe(false);
    });
  });

  describe('findByAddress', () => {
    it('should call prisma.walletAddress.findFirst with address filter', async () => {
      const now = new Date();
      const mockWallet = { id: '1', userId: 'u1', address: '0xabc', chain: 'ethereum', label: null, createdAt: now, balanceEth: '1.5', balanceWei: '1500000000000000000', balanceUpdatedAt: now };
      mockPrisma.walletAddress.findFirst.mockResolvedValue(mockWallet);

      const result = await repo.findByAddress('0xabc');

      expect(mockPrisma.walletAddress.findFirst).toHaveBeenCalledWith({
        where: { address: '0xabc' },
      });
      expect(result).toEqual(mockWallet);
    });
  });

  describe('updateBalance', () => {
    it('should call prisma.walletAddress.updateMany with balance data', async () => {
      const balance = { balanceEth: '2.0', balanceWei: '2000000000000000000' };
      mockPrisma.walletAddress.updateMany.mockResolvedValue({ count: 1 });

      await repo.updateBalance('0xabc', balance);

      expect(mockPrisma.walletAddress.updateMany).toHaveBeenCalledWith({
        where: { address: '0xabc' },
        data: {
          balanceEth: '2.0',
          balanceWei: '2000000000000000000',
          balanceUpdatedAt: expect.any(Date),
        },
      });
    });
  });
});
