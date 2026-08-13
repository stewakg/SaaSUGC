/**
 * @adgen/core — shared interfaces, types, pricing, credit rules, provider factory.
 *
 * Everything external (web, worker) imports from here, never from a concrete
 * provider. This is what makes the mock-first architecture work.
 */
export * from './types.ts';
export * from './interfaces.ts';
export * from './pricing.ts';
export * from './credits.ts';
export * from './captions.ts';
export * from './constants.ts';
export { loadEnv, hasKey } from './env.ts';
export type { Env } from './env.ts';
export { createProviders, getAI, mockProviderSlots } from './providers/factory.ts';
export type { Providers } from './providers/factory.ts';
export { consoleLogger } from './logger.ts';
export {
  MockAIProvider,
  MockBilling,
  MockRenderer,
  MockScriptProvider,
  MockScraper,
  MockStorage,
  MockVoiceProvider,
} from './providers/mocks.ts';