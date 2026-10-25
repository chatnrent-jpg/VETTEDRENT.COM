import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let serverServiceRoleClient: SupabaseClient | null = null;
let serverServiceRoleKeyCached: string | null = null;

/**
 * sb_publishable_ and sb_secret_ keys are not JWTs. They belong in the apikey
 * header only. Sending one as Authorization Bearer makes Supabase return
 * "Invalid API key".
 */
function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const apiKey = headers.get("apikey");
  const authorization = headers.get("Authorization");
  if (
    apiKey &&
    authorization === `Bearer ${apiKey}` &&
    (apiKey.startsWith("sb_publishable_") || apiKey.startsWith("sb_secret_"))
  ) {
    headers.delete("Authorization");
  }
  return fetch(input, { ...init, headers });
}

/**
 * Browser Supabase client. Uses the anon key and the library session
 * (Authorization bearer on later API calls). Never uses the service role key.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");
  }
  if (!browserClient) {
    browserClient = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
      },
      global: { fetch: supabaseFetch },
    });
  }
  return browserClient;
}

/**
 * Server-side Supabase client initialized with `SUPABASE_SERVICE_ROLE_KEY`.
 * Used for automated server transactions (conversion engine, ledger installments,
 * and host availability persistence) so RLS locks are bypassed seamlessly.
 */
export function getSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  if (!serverServiceRoleClient || serverServiceRoleKeyCached !== `${url}|${key}`) {
    serverServiceRoleClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: supabaseFetch },
    });
    serverServiceRoleKeyCached = `${url}|${key}`;
  }
  return serverServiceRoleClient;
}

/** Explicit alias for automated service-role transactions bypassing RLS. */
export const getSupabaseServiceRoleClient = getSupabaseServerClient;


