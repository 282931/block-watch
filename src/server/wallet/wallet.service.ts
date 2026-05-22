import { EtherscanProvider, formatEther } from 'ethers';
import type { WalletAddress } from '@/prisma';
import { AuthError, ConflictError, NotFoundError, RateLimitError, ServerError } from '@/server/lib/errors';
import { WalletRepository } from '@/server/wallet/wallet.repository';
import type { AddWalletInput } from '@/server/wallet/wallet.schema';
import type { WalletAddressWithBalance } from '@/features/wallet/wallet.types';
import { getRedis, withRedis, BALANCE_CACHE_TTL, BALANCE_CACHE_PREFIX } from '@/server/lib/redis';

const ETHEREUM_MAINNET_CHAIN_ID = 1;
const BALANCE_STALE_MS = 30_000; // 30 seconds

type BalanceProvider = {
  getBalance(address: string): Promise<bigint>;
};

type BalanceProviderFactory = () => BalanceProvider;

type BalanceResult = {
  balanceEth: string;
  balanceWei: string;
};

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
    const wallets = await this.repo.findByUserId(userId);
    return wallets.map((w) => ({ ...w, balanceEth: w.balanceEth ?? undefined, balanceWei: w.balanceWei ?? undefined, balanceUpdatedAt: w.balanceUpdatedAt ?? undefined }));
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

  /**
   * Get wallet balance with Redis-first caching and DB fallback.
   *
   * 1. Check Redis → if hit and fresh, return immediately.
   * 2. If Redis miss → check DB cache.
   * 3. If DB cache is fresh → populate Redis on read-through, return.
   * 4. If DB cache is stale (>=30s) → return stale data, fire background refresh.
   * 5. If no cache → fetch from RPC synchronously, persist to DB + Redis.
   */
  async getBalance(address: string): Promise<BalanceResult> {
    // 1. Try Redis first (fastest)
    const redisHit = await withRedis(
      async (redis) => {
        const raw = await redis.get(`${BALANCE_CACHE_PREFIX}:${address}`);
        if (!raw) return null;
        return JSON.parse(raw) as { balanceEth: string; balanceWei: string; updatedAt: number };
      },
      (async () => null),
    );

    if (redisHit) {
      return { balanceEth: redisHit.balanceEth, balanceWei: redisHit.balanceWei };
    }

    // 2. Redis miss — check DB cache
    const wallet = await this.repo.findByAddress(address);
    const cached = wallet?.balanceUpdatedAt
      ? { balanceEth: wallet.balanceEth!, balanceWei: wallet.balanceWei!, updatedAt: wallet.balanceUpdatedAt }
      : null;

    if (cached) {
      const age = Date.now() - cached.updatedAt.getTime();
      if (age < BALANCE_STALE_MS) {
        // Fresh DB cache – populate Redis on read-through
        void this.writeRedisCache(address, cached.balanceEth, cached.balanceWei);
        return { balanceEth: cached.balanceEth, balanceWei: cached.balanceWei };
      }

      // Stale cache – return stale data and refresh in background
      this.refreshBalanceInBackground(address);
      return { balanceEth: cached.balanceEth, balanceWei: cached.balanceWei };
    }

    // 3. No cache at all – fetch from RPC synchronously
    const balance = await this.fetchBalance(address);
    await this.persistBalance(address, balance);
    return balance;
  }

  /**
   * Fetch balance from RPC provider.
   */
  private async fetchBalance(address: string): Promise<BalanceResult> {
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

  /**
   * Persist balance to DB and Redis cache.
   */
  private async persistBalance(address: string, balance: BalanceResult): Promise<void> {
    await this.repo.updateBalance(address, balance);
    await this.writeRedisCache(address, balance.balanceEth, balance.balanceWei);
  }

  private async writeRedisCache(address: string, balanceEth: string, balanceWei: string): Promise<void> {
    void withRedis(
      async (redis) => {
        const data = JSON.stringify({ balanceEth, balanceWei, updatedAt: Date.now() });
        await redis.setex(`${BALANCE_CACHE_PREFIX}:${address}`, BALANCE_CACHE_TTL, data);
      },
      () => Promise.resolve(),
    );
  }

  /**
   * Fire-and-forget background refresh. Never throws to the caller.
   */
  private refreshBalanceInBackground(address: string): void {
    void this.fetchBalance(address)
      .then((balance) => this.persistBalance(address, balance))
      .catch((err) => console.error(`[wallet] background balance refresh failed for ${address}:`, err));
  }
}

export const walletService = new WalletService(new WalletRepository());
