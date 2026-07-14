import type { PropsWithChildren } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function RequireAuth({ children }: PropsWithChildren) {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <main className="page page--narrow">
        <section className="notice" aria-live="polite">
          <p className="eyebrow">Checking session</p>
          <h1>Opening the ledger.</h1>
          <p>Confirming your authenticated Supabase session.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page page--narrow">
        <section className="notice" role="alert">
          <p className="eyebrow">Sign in required</p>
          <h1>Discord login is required.</h1>
          <p>Protected ledger pages are available only after signing in.</p>
          <Link className="button" to="/">
            Return to sign in
          </Link>
        </section>
      </main>
    );
  }

  return children;
}
