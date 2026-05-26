import { EtherscanProvider, formatEther } from 'ethers';
import type { Job } from 'bullmq';
import { RateLimitError, ServerError } from '@/server/lib/errors';
import { WalletRepository, type BalanceData } from '@/server/wallet/wallet.repository';
import {
  BALANCE_CACHE_TTL,
  buildBalanceCacheKey,
  withRedis,
} from '@/server/lib/redis';
import type { BalanceSyncJobData } from '@/server/queue/balance-sync.queue';

const ETHEREUM_MAINNET_CHAIN_ID = 1;

export type BalanceProvider = {
  getBalance(address: string): Promise<bigint>;
};

export type BalanceProviderFactory = () => BalanceProvider;

function defaultProviderFactory(): BalanceProvider {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    // Surfaced as a job failure so BullMQ records it; capped by `attempts: 3`.
    throw new ServerError('Missing ETHERSCAN_API_KEY for balance-sync worker.');
  }
  return new EtherscanProvider(ETHEREUM_MAINNET_CHAIN_ID, apiKey);
}

function trimEthBalance(balance: string): string {
  const [whole, fractional = ''] = balance.split('.');
  const trimmedFractional = fractional.replace(/0+$/, '').slice(0, 6);
  return trimmedFractional ? `${whole}.${trimmedFractional}` : whole;
}

export type ProcessorDeps = {
  repo?: WalletRepository;
  providerFactory?: BalanceProviderFactory;
};

let cachedProvider: BalanceProvider | null = null;

function resolveProvider(factory: BalanceProviderFactory): BalanceProvider {
  if (!cachedProvider) {
    cachedProvider = factory();
  }
  return cachedProvider;
}

export function resetProviderCache(): void {
  cachedProvider = null;
}

export function createBalanceSyncProcessor(deps: ProcessorDeps = {}) {
  const repo = deps.repo ?? new WalletRepository();
  const providerFactory = deps.providerFactory ?? defaultProviderFactory;

  return async function processBalanceSync(job: Job<BalanceSyncJobData>): Promise<BalanceData> {
    const { chain, address } = job.data;
    const normalized = address.toLowerCase();

    let balanceWei: bigint;
    try {
      balanceWei = await resolveProvider(providerFactory).getBalance(normalized);
    } catch (error) {
      if (error instanceof ServerError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new RateLimitError(`Failed to fetch balance for ${normalized}: ${message}`);
    }

    const balance: BalanceData = {
      balanceWei: balanceWei.toString(),
      balanceEth: trimEthBalance(formatEther(balanceWei)),
    };

    await repo.updateBalance(normalized, balance);

    await withRedis(
      async (redis) => {
        const payload = JSON.stringify({
          balanceEth: balance.balanceEth,
          balanceWei: balance.balanceWei,
          updatedAt: Date.now(),
        });
        await redis.setex(
          buildBalanceCacheKey(chain, normalized),
          BALANCE_CACHE_TTL,
          payload,
        );
      },
      async () => undefined,
    );

    return balance;
  };
}
