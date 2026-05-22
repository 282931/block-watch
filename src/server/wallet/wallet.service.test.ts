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
  return { WalletRepository: MockRepo };
});

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
    beforeEach(() => {
      process.env.ETHERSCAN_API_KEY = 'test-key';
    });

    it('should throw RateLimitError on RPC failure', async () => {
      vi.spyOn(WalletService.prototype as any, 'getProvider').mockImplementation(() => {
        throw new Error('RPC error');
      });

      await expect(service.getBalance('0xabc')).rejects.toThrow(RateLimitError);
    });
  });
});
