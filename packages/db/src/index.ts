/** @adgen/db — typed Supabase client + database types. */
export {
  createBrowserClient,
  createServiceClient,
  table,
} from './client.ts';
export type {
  Database,
  JobType,
  JobStatus,
  AssetKind,
} from './generated/database.types.ts';