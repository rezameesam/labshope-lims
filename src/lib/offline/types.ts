/** The slice of the Supabase client the sync code needs (keeps it easy to test). */
export interface SupabaseLike {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
}
