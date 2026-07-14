import { useState } from "react";
import { useAuth } from "../lib/auth-context";

export function SignInPanel() {
  const { isConfigured, loading, user, profile, signInWithDiscord, signOut } =
    useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);

    try {
      await signInWithDiscord();
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Discord sign in could not be started."
      );
    }
  }

  async function handleSignOut() {
    setError(null);

    try {
      await signOut();
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Sign out failed."
      );
    }
  }

  if (!isConfigured) {
    return (
      <div className="auth-panel" aria-label="Authentication status">
        <p>Supabase configuration is required before Discord sign in can start.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="auth-panel" aria-live="polite">
        <p>Checking session...</p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="auth-panel" aria-label="Authentication status">
        <p>
          Signed in as <strong>{profile?.display_name ?? user.email ?? "player"}</strong>.
        </p>
        <button className="button button--secondary" type="button" onClick={handleSignOut}>
          Sign out
        </button>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="auth-panel" aria-label="Authentication status">
      <button className="button" type="button" onClick={handleSignIn}>
        Sign in with Discord
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
