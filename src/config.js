const defaultSupabaseUrl = "https://bxujxmmoyxlqjdqhpkjs.supabase.co";
const defaultPublishableKey = "sb_publishable_9Dcspd26ODP1QWcebX-8lA_j53GHFxE";

export const configuration = Object.freeze({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || defaultSupabaseUrl,
  supabasePublishableKey:
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || defaultPublishableKey,
});

export function validateConfiguration() {
  if (!configuration.supabaseUrl || !configuration.supabasePublishableKey) {
    throw new Error("The public Supabase URL and publishable key are not configured.");
  }
}
