import { EtherscanProvider, formatEther } from 'ethers';
import type { WalletAddress } from '@/prisma';
import { AuthError, ConflictError, NotFoundError, RateLimitError, ServerError } from '@/server/lib/errors';
import { WalletRepository } from '@/server/wallet/wallet.repository';
import type { AddWalletInput } from '@/server/wallet/wallet.schema';
import type { WalletAddressWithBalance } from '@/features/wallet/wallet.types';
import {
  BALANCE_CACHE_TTL,
  BALANCE_REFRESH_LOCK_TTL,
  buildBalanceCacheKey,
  buildBalanceRefreshLockKey,
  withRedis,
} from '@/server/lib/redis';

const ETHEREUM_MAINNET_CHAIN_ID = 1;
const ETHEREUM_CHAIN = 'ethereum';
const BALANCE_STALE_MS = 30_000;

type BalanceProvider = {
  getBalance(address: string): Promise<bigint>;
};

type BalanceProviderFactory = () => BalanceProvider;

type BalanceResult = {
  balanceEth: string;
  balanceWei: string;
  isStale: boolean;
};

function createEtherscanProvider(): BalanceProvider {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new ServerError('Missing Etherscan API key.');
  }
  return new EtherscanProvider(ETHEREUM_MAINNET_CHAIN_ID, apiKey);
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
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
  ) { }

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
    const wallets = await this.repo.findByUserId(userId);
    return wallets.map((w) => ({ ...w, balanceEth: w.balanceEth ?? undefined, balanceWei: w.balanceWei ?? undefined, balanceUpdatedAt: w.balanceUpdatedAt ?? undefined }));
  }

  async addWallet(userId: string, input: AddWalletInput): Promise<WalletAddress> {
    if (!userId) {
      throw new AuthError('Please log in to add a wallet address.');
    }

    const address = normalizeAddress(input.address);
    const exists = await this.repo.existsByUserAndAddress(userId, address);
    if (exists) {
      throw new ConflictError('This wallet address is already in your list.');
    }

    return this.repo.create({
      userId,
      address,
      chain: ETHEREUM_CHAIN,
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

  async getCachedBalance(address: string): Promise<BalanceResult | null> {
    const normalizedAddress = normalizeAddress(address);

    const redisHit = await this.readRedisCache(normalizedAddress);
    if (redisHit) {
      return { balanceEth: redisHit.balanceEth, balanceWei: redisHit.balanceWei, isStale: false };
    }

    const cached = await this.readDbBalance(normalizedAddress);
    if (!cached) {
      return null;
    }

    const isStale = Date.now() - cached.updatedAt.getTime() >= BALANCE_STALE_MS;
    if (!isStale) {
      void this.writeRedisCache(normalizedAddress, cached.balanceEth, cached.balanceWei);
    }

    return { balanceEth: cached.balanceEth, balanceWei: cached.balanceWei, isStale };
  }

  async getBalance(address: string): Promise<BalanceResult> {
    const normalizedAddress = normalizeAddress(address);
    const cached = await this.getCachedBalance(normalizedAddress);

    if (cached && !cached.isStale) {
      return cached;
    }

    const lockAcquired = await this.acquireRefreshLock(normalizedAddress);
    if (!lockAcquired && cached) {
      return cached;
    }

    const balance = await this.fetchBalance(normalizedAddress);
    await this.persistBalance(normalizedAddress, balance);
    return balance;
  }

  private async readRedisCache(address: string): Promise<{ balanceEth: string; balanceWei: string; updatedAt: number } | null> {
    return withRedis(
      async (redis) => {
        const raw = await redis.get(buildBalanceCacheKey(ETHEREUM_CHAIN, address));
        if (!raw) return null;
        return JSON.parse(raw) as { balanceEth: string; balanceWei: string; updatedAt: number };
      },
      async () => null,
    );
  }

  private async readDbBalance(address: string): Promise<{ balanceEth: string; balanceWei: string; updatedAt: Date } | null> {
    const wallet = await this.repo.findByAddress(address);
    return wallet?.balanceUpdatedAt
      ? { balanceEth: wallet.balanceEth!, balanceWei: wallet.balanceWei!, updatedAt: wallet.balanceUpdatedAt }
      : null;
  }

  private async acquireRefreshLock(address: string): Promise<boolean> {
    return withRedis(
      async (redis) => {
        const result = await redis.set(
          buildBalanceRefreshLockKey(ETHEREUM_CHAIN, address),
          '1',
          'EX',
          BALANCE_REFRESH_LOCK_TTL,
          'NX',
        );
        return result === 'OK';
      },
      async () => true,
    );
  }

  private async fetchBalance(address: string): Promise<BalanceResult> {
    try {
      const balanceWei = await this.getProvider().getBalance(address);
      return {
        balanceWei: balanceWei.toString(),
        balanceEth: trimEthBalance(formatEther(balanceWei)),
        isStale: false,
      };
    } catch (error) {
      if (error instanceof RateLimitError || error instanceof ServerError) {
        throw error;
      }
      throw new RateLimitError('Could not reach the Ethereum RPC endpoint.');
    }
  }

  private async persistBalance(address: string, balance: BalanceResult): Promise<void> {
    await this.repo.updateBalance(address, {
      balanceEth: balance.balanceEth,
      balanceWei: balance.balanceWei,
    });
    await this.writeRedisCache(address, balance.balanceEth, balance.balanceWei);
  }

  private async writeRedisCache(address: string, balanceEth: string, balanceWei: string): Promise<void> {
    await withRedis(
      async (redis) => {
        const data = JSON.stringify({ balanceEth, balanceWei, updatedAt: Date.now() });
        await redis.setex(buildBalanceCacheKey(ETHEREUM_CHAIN, address), BALANCE_CACHE_TTL, data);
      },
      async () => undefined,
    );
  }

}

export const walletService = new WalletService(new WalletRepository());
