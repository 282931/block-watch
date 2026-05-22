import Redis from 'ioredis';

let redis: Redis | null = null;

function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redis.on('error', (err) => {
      console.warn('[redis] connection error:', err.message);
    });
  }
  return redis;
}

export async function withRedis<T>(
  fn: (client: Redis) => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    const client = getRedis();
    return await fn(client);
  } catch {
    return fallback();
  }
}

export const BALANCE_CACHE_TTL = 30; // seconds
export const BALANCE_CACHE_PREFIX = 'wallet:balance';
