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

export function addSupabaseApiKeyToUrl(url: string, apiKey: string) {
  const nextUrl = new URL(url);

  if (!nextUrl.searchParams.has("apikey")) {
    nextUrl.searchParams.set("apikey", apiKey);
  }

  return nextUrl.toString();
}

export function getSupabaseApiKey() {
  const env = getClientEnv();

  if (!env.ok) {
    return null;
  }

  return env.values.VITE_SUPABASE_ANON_KEY;
}
