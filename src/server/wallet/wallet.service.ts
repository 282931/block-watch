import type { WalletAddress } from '@/prisma';
import { AuthError, ConflictError, NotFoundError } from '@/server/lib/errors';
import { WalletRepository } from '@/server/wallet/wallet.repository';
import type { AddWalletInput } from '@/server/wallet/wallet.schema';
import type { WalletAddressWithBalance } from '@/features/wallet/wallet.types';
import {
  BALANCE_CACHE_TTL,
  buildBalanceCacheKey,
  withRedis,
} from '@/server/lib/redis';
import { enqueueBalanceSync } from '@/server/queue/balance-sync.queue';

const ETHEREUM_CHAIN = 'ethereum';
// Treat anything within this window as "fresh enough" so the UI stops
// flickering through stale states while the worker keeps up with reality.
const BALANCE_STALE_MS = 5 * 60_000;

export type BalanceResult = {
  balanceEth: string;
  balanceWei: string;
  isStale: boolean;
};

type Enqueue = (data: { chain: string; address: string }) => Promise<boolean>;

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export class WalletService {
  constructor(
    private repo: WalletRepository,
    private enqueue: Enqueue = enqueueBalanceSync,
  ) { }

  async listWallets(userId: string): Promise<WalletAddressWithBalance[]> {
    if (!userId) {
      throw new AuthError('Please log in to view wallets.');
    }
    const wallets = await this.repo.findByUserId(userId);
    return wallets.map((w) => ({
      ...w,
      balanceEth: w.balanceEth ?? undefined,
      balanceWei: w.balanceWei ?? undefined,
      balanceUpdatedAt: w.balanceUpdatedAt ?? undefined,
    }));
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

    const created = await this.repo.create({
      userId,
      address,
      chain: ETHEREUM_CHAIN,
      label: input.label ?? null,
    });

    // Kick off the first balance fetch in the background.
    await this.enqueue({ chain: ETHEREUM_CHAIN, address });

    return created;
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
   * Returns the latest cached balance for an address.
   *
   * Order: Redis -> DB. Triggers a balance-sync job on miss or when the cached
   * value is older than `BALANCE_STALE_MS`. Never performs a chain call itself.
   */
  async getCachedBalance(address: string): Promise<BalanceResult | null> {
    const normalizedAddress = normalizeAddress(address);

    // Mark this address as recently accessed so the scheduler keeps refreshing
    // it. Fire-and-forget: a touch failure must never break the read path.
    void this.touchLastAccessed(normalizedAddress);

    const redisHit = await this.readRedisCache(normalizedAddress);
    if (redisHit) {
      const isStale = Date.now() - redisHit.updatedAt >= BALANCE_STALE_MS;
      if (isStale) {
        await this.enqueue({ chain: ETHEREUM_CHAIN, address: normalizedAddress });
      }
      return { balanceEth: redisHit.balanceEth, balanceWei: redisHit.balanceWei, isStale };
    }

    const cached = await this.readDbBalance(normalizedAddress);
    if (!cached) {
      await this.enqueue({ chain: ETHEREUM_CHAIN, address: normalizedAddress });
      return null;
    }

    const isStale = Date.now() - cached.updatedAt.getTime() >= BALANCE_STALE_MS;
    // Always hot the Redis cache from DB so the next read hits Redis and
    // avoids the slower fallback path, even if the value is stale.
    void this.writeRedisCache(normalizedAddress, cached.balanceEth, cached.balanceWei);
    if (isStale) {
      await this.enqueue({ chain: ETHEREUM_CHAIN, address: normalizedAddress });
    }

    return { balanceEth: cached.balanceEth, balanceWei: cached.balanceWei, isStale };
  }

  /**
   * Public read entrypoint used by server actions.
   *
   * Returns whatever value the cache currently holds (possibly null while a
   * worker is still warming the address). The worker is the only writer.
   */
  async getBalance(address: string): Promise<BalanceResult | null> {
    return this.getCachedBalance(address);
  }

  private async readRedisCache(
    address: string,
  ): Promise<{ balanceEth: string; balanceWei: string; updatedAt: number } | null> {
    return withRedis(
      async (redis) => {
        const raw = await redis.get(buildBalanceCacheKey(ETHEREUM_CHAIN, address));
        if (!raw) return null;
        return JSON.parse(raw) as { balanceEth: string; balanceWei: string; updatedAt: number };
      },
      async () => null,
    );
  }

  private async readDbBalance(
    address: string,
  ): Promise<{ balanceEth: string; balanceWei: string; updatedAt: Date } | null> {
    const wallet = await this.repo.findByAddress(address);
    return wallet?.balanceUpdatedAt
      ? { balanceEth: wallet.balanceEth!, balanceWei: wallet.balanceWei!, updatedAt: wallet.balanceUpdatedAt }
      : null;
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

  private async touchLastAccessed(address: string): Promise<void> {
    try {
      await this.repo.touchLastAccessed(address);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[wallet] touchLastAccessed failed:', message);
    }
  }
}

export const walletService = new WalletService(new WalletRepository());
