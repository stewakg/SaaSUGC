/**
 * Worker entry — F0 minimal boot.
 *
 * Full BullMQ consumer + job pipeline lands in F2. For now this:
 *   - resolves providers via the mock-first factory (so we can SEE which mode
 *     each provider is in);
 *   - pings Redis if reachable, else prints a clear mock-mode notice;
 *   - stays alive so `pnpm dev` shows a healthy worker process.
 *
 * Mock-first: starts cleanly with zero services running.
 */
import { createProviders } from '@adgen/core';

async function main() {
  const providers = createProviders();

  const providerModes = Object.fromEntries(
    Object.entries(providers).map(([k, v]) => [k, v.name]),
  );

  console.log('[worker] provider modes:');
  for (const [k, name] of Object.entries(providerModes)) {
    const isMock = String(name).startsWith('mock');
    console.log(`   ${k.padEnd(10)} ${name} ${isMock ? '(mock)' : '(real)'}`);
  }

  // Try Redis (optional in F0).
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  try {
    const { default: IORedis } = await import('ioredis');
    const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    console.log(`[worker] redis reachable at ${redisUrl} ✓`);
  } catch {
    console.log(
      `[worker] redis not reachable at ${redisUrl} — running without queue ` +
        `(F0 shell). Start it with: pnpm services:up`,
    );
  }

  console.log('[worker] idle (F0). BullMQ consumer wired in F2. Ctrl+C to stop.');

  // Keep the process alive in dev.
  process.on('SIGINT', () => {
    console.log('[worker] shutting down');
    process.exit(0);
  });
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});