import { EtherscanProvider, formatEther } from 'ethers';
import type { WalletAddress } from '@/prisma';
import { AuthError, ConflictError, NotFoundError, RateLimitError, ServerError } from '@/server/lib/errors';
import { WalletRepository } from '@/server/wallet/wallet.repository';
import type { AddWalletInput } from '@/server/wallet/wallet.schema';
import type { WalletAddressWithBalance } from '@/features/wallet/wallet.types';

const ETHEREUM_MAINNET_CHAIN_ID = 1;

type BalanceProvider = {
  getBalance(address: string): Promise<bigint>;
};

type BalanceProviderFactory = () => BalanceProvider;

function createEtherscanProvider(): BalanceProvider {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new ServerError('Missing Etherscan API key.');
  }
  return new EtherscanProvider(ETHEREUM_MAINNET_CHAIN_ID, apiKey);
}

function trimEthBalance(balance: string): string {
  const [whole, fractional = ''] = balance.split('.');
  const trimmedFractional = fractional.replace(/0+$/, '').slice(0, 6);
  return trimmedFractional ? `${whole}.${trimmedFractional}` : whole;
}

export class WalletService {
  private provider: BalanceProvider | null = null;

  constructor(
    private repo: WalletRepository,
    private createProvider: BalanceProviderFactory = createEtherscanProvider,
  ) {}

  private getProvider(): BalanceProvider {
    if (!this.provider) {
      this.provider = this.createProvider();
    }
    return this.provider;
  }

  async listWallets(userId: string): Promise<WalletAddressWithBalance[]> {
    if (!userId) {
      throw new AuthError('Please log in to view wallets.');
    }
    return this.repo.findByUserId(userId);
  }

  async addWallet(userId: string, input: AddWalletInput): Promise<WalletAddress> {
    if (!userId) {
      throw new AuthError('Please log in to add a wallet address.');
    }

    const exists = await this.repo.existsByUserAndAddress(userId, input.address);
    if (exists) {
      throw new ConflictError('This wallet address is already in your list.');
    }

    return this.repo.create({
      userId,
      address: input.address,
      chain: 'ethereum',
      label: input.label ?? null,
    });
  }

  async deleteWallet(userId: string, walletId: string): Promise<void> {
    if (!userId) {
      throw new AuthError('Please log in.');
    }

    const wallet = await this.repo.findByIdAndUser(walletId, userId);
    if (!wallet) {
      throw new NotFoundError('Wallet address not found.');
    }

    await this.repo.deleteByIdAndUser(walletId, userId);
  }

  async getBalance(address: string): Promise<{ balanceEth: string; balanceWei: string }> {
    try {
      const balanceWei = await this.getProvider().getBalance(address);
      return {
        balanceWei: balanceWei.toString(),
        balanceEth: trimEthBalance(formatEther(balanceWei)),
      };
    } catch (error) {
      if (error instanceof RateLimitError || error instanceof ServerError) {
        throw error;
      }
      throw new RateLimitError('Could not reach the Ethereum RPC endpoint.');
    }
  }
}

export const walletService = new WalletService(new WalletRepository());
