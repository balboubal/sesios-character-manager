import { createClient } from "@supabase/supabase-js";
import { configuration, validateConfiguration } from "./config.js";

validateConfiguration();

export const initialAuthType =
  new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type") ||
  new URLSearchParams(window.location.search).get("type");

export const supabase = createClient(
  configuration.supabaseUrl,
  configuration.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);
