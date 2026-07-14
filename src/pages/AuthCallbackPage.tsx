import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { getSupabaseClient, parseOAuthCallbackParams } from "../lib/supabase";

export function AuthCallbackPage() {
  const client = getSupabaseClient();
  const { loading, user, profileError, refreshSession } = useAuth();
  const navigate = useNavigate();
  const callbackParams = useMemo(
    () => parseOAuthCallbackParams(window.location.href),
    []
  );
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (user) {
      navigate("/campaigns", { replace: true });
      return;
    }

    if (!client) {
      setExchangeError("Supabase is not configured.");
      return;
    }

    const authClient = client;

    if (callbackParams.error) {
      setExchangeError(
        callbackParams.errorDescription ??
          `Discord authentication failed: ${callbackParams.error}.`
      );
      return;
    }

    if (!callbackParams.code && !callbackParams.accessToken) {
      setExchangeError(
        "No authentication token was returned. Start Discord sign in again."
      );
      return;
    }

    const exchangeKey = `warcry-herald-oauth-callback:${
      callbackParams.code ?? callbackParams.accessToken
    }`;

    if (sessionStorage.getItem(exchangeKey) === "processing") {
      return;
    }

    sessionStorage.setItem(exchangeKey, "processing");

    async function exchangeCode() {
      const { error } = callbackParams.code
        ? await authClient.auth.exchangeCodeForSession(callbackParams.code)
        : await authClient.auth.setSession({
            access_token: callbackParams.accessToken!,
            refresh_token: callbackParams.refreshToken ?? ""
          });

      if (error) {
        sessionStorage.removeItem(exchangeKey);
        setExchangeError(error.message);
        return;
      }

      sessionStorage.setItem(exchangeKey, "done");
      await refreshSession();
      navigate("/campaigns", { replace: true });
    }

    void exchangeCode();
  }, [
    callbackParams.code,
    callbackParams.accessToken,
    callbackParams.error,
    callbackParams.errorDescription,
    callbackParams.refreshToken,
    client,
    loading,
    navigate,
    refreshSession,
    user
  ]);

  return (
    <main className="page page--narrow">
      <section className="notice" aria-live="polite" role={exchangeError ? "alert" : undefined}>
        <p className="eyebrow">Discord authentication</p>
        <h1>Completing sign in.</h1>
        <p>
          {exchangeError
            ? "The Discord sign-in callback could not be completed."
            : profileError
            ? "Your Discord session was accepted, but the profile record could not be loaded."
            : "The campaign ledger will open after your session is confirmed."}
        </p>
        {exchangeError ? <p className="form-error">{exchangeError}</p> : null}
        {profileError ? <p className="form-error">{profileError}</p> : null}
        {exchangeError ? (
          <Link className="button button--secondary" to="/">
            Return to sign in
          </Link>
        ) : null}
      </section>
    </main>
  );
}
