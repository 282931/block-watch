import Redis from 'ioredis';

let connection: Redis | null = null;

function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

/**
 * Returns a dedicated ioredis connection configured for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false`,
 * so we cannot reuse the cache-oriented client in `src/server/lib/redis.ts`.
 */
export function getQueueConnection(): Redis {
  if (!connection) {
    connection = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });

    connection.on('error', (err) => {
      console.warn('[queue:redis] connection error:', err.message);
    });
  }
  return connection;
}

export async function closeQueueConnection(): Promise<void> {
  if (connection) {
    await connection.quit().catch(() => undefined);
    connection = null;
  }
}
