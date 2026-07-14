import type { PropsWithChildren } from "react";
import { getClientEnv } from "../lib/env";

export function ConfigGate({ children }: PropsWithChildren) {
  const env = getClientEnv();

  if (!env.ok) {
    return (
      <main className="page page--narrow">
        <section className="notice notice--warning" role="alert">
          <p className="eyebrow">Configuration required</p>
          <h1>Supabase is not configured yet.</h1>
          <p>
            Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to a local
            `.env` file to enable authenticated campaign features.
          </p>
          <ul>
            {env.errors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </section>
      </main>
    );
  }

  return children;
}
