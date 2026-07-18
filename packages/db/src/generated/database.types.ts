/**
 * Hand-written database types matching supabase/migrations/0001_init_schema.sql.
 *
 * NOTE: This is a STARTER file so the typed client + web compile before the
 * local Supabase stack is running. Once `supabase start` works, regenerate
 * the real file with:  pnpm --filter @adgen/db gen-types
 * (that overwrites this with `supabase gen types typescript --local`).
 *
 * Keep the shape in sync with the migration until then.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          balance: number;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          balance?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          balance?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      credits_ledger: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          reason: string;
          job_id: string | null;
          external_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          delta: number;
          reason: string;
          job_id?: string | null;
          external_ref?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          delta?: number;
          reason?: string;
          job_id?: string | null;
          external_ref?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'credits_ledger_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      jobs: {
        Row: {
          id: string;
          user_id: string;
          type: JobType;
          status: JobStatus;
          params: Json;
          result: Json | null;
          cost: number;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: JobType;
          status?: JobStatus;
          params?: Json;
          result?: Json | null;
          cost?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: JobType;
          status?: JobStatus;
          params?: Json;
          result?: Json | null;
          cost?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'jobs_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      assets: {
        Row: {
          id: string;
          job_id: string;
          user_id: string;
          kind: AssetKind;
          storage_key: string | null;
          url: string;
          meta: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          user_id: string;
          kind: AssetKind;
          storage_key?: string | null;
          url: string;
          meta?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          user_id?: string;
          kind?: AssetKind;
          storage_key?: string | null;
          url?: string;
          meta?: Json;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'assets_job_id_fkey'; columns: ['job_id']; referencedRelation: 'jobs'; referencedColumns: ['id'] },
          { foreignKeyName: 'assets_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      signup_bonus_credits: { Args: Record<string, never>; Returns: number };
      handle_new_user: { Args: Record<string, never>; Returns: undefined };
      charge_credits: { Args: { p_user_id: string; p_job_id: string; p_amount: number }; Returns: undefined };
      add_credits: { Args: { p_user_id: string; p_amount: number; p_reason: string }; Returns: number };
      add_credits_idempotent: { Args: { p_user_id: string; p_amount: number; p_reason: string; p_external_ref: string }; Returns: number };
      tg_set_updated_at: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: {
      job_type: JobType;
      job_status: JobStatus;
      asset_kind: AssetKind;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type JobType =
  | 'matrix'
  | 'edit'
  | 'image_ads'
  | 'mix'
  | 'quick_test'
  | 'translate'
  | 'enhance'
  | 'remove_text'
  | 'ai_video';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export type AssetKind = 'video' | 'image' | 'audio';