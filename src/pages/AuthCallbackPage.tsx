import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function AuthCallbackPage() {
  const { loading, user, profileError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (user) {
      navigate("/campaigns", { replace: true });
    }
  }, [loading, navigate, user]);

  return (
    <main className="page page--narrow">
      <section className="notice" aria-live="polite">
        <p className="eyebrow">Discord authentication</p>
        <h1>Completing sign in.</h1>
        <p>
          {profileError
            ? "Your Discord session was accepted, but the profile record could not be loaded."
            : "The campaign ledger will open after your session is confirmed."}
        </p>
        {profileError ? <p className="form-error">{profileError}</p> : null}
      </section>
    </main>
  );
}
