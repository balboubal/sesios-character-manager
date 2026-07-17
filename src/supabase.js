import { createClient } from "@supabase/supabase-js";
import { configuration, validateConfiguration } from "./config.js";

validateConfiguration();

// Read the auth type from the URL synchronously, BEFORE createClient runs.
// With detectSessionInUrl the client strips the hash on load, so this must
// happen first or invite/recovery links lose their `type` and fall through
// to the normal sign-in screen.
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
