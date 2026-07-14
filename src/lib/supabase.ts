import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv } from "./env";

const cachedClients = new Map<string, SupabaseClient>();

export function getSupabaseClient(): SupabaseClient | null {
  const env = getClientEnv();

  if (!env.ok) {
    return null;
  }

  const cacheKey = `${env.values.VITE_SUPABASE_URL}:${env.values.VITE_SUPABASE_ANON_KEY}`;
  const cachedClient = cachedClients.get(cacheKey);

  if (cachedClient) {
    return cachedClient;
  }

  const client = createClient(
    env.values.VITE_SUPABASE_URL,
    env.values.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true
      }
    }
  );

  cachedClients.set(cacheKey, client);
  return client;
}

export function getOAuthRedirectUrl() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = base ? `${base}/` : "/";

  return `${window.location.origin}${path}#/auth/callback`;
}

export type OAuthCallbackParams = {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  errorDescription: string | null;
};

export function parseOAuthCallbackParams(url: string): OAuthCallbackParams {
  const parsedUrl = new URL(url);
  const params = new URLSearchParams(parsedUrl.search);
  const hash = parsedUrl.hash.startsWith("#") ? parsedUrl.hash.slice(1) : parsedUrl.hash;

  for (const separator of ["?", "#"]) {
    const fragmentIndex = hash.indexOf(separator);

    if (fragmentIndex >= 0) {
      const fragmentParams = new URLSearchParams(hash.slice(fragmentIndex + 1));
      fragmentParams.forEach((value, key) => {
        if (!params.has(key)) {
          params.set(key, value);
        }
      });
    }
  }

  return {
    code: params.get("code"),
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    error: params.get("error"),
    errorDescription: params.get("error_description")
  };
}
