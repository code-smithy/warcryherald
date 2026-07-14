import { NavLink, Outlet } from "react-router-dom";
import { ErrorBoundary } from "../app/ErrorBoundary";
import { useAuth } from "../lib/auth-context";

export function AppShell() {
  const { isConfigured, loading, user, profile, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true">
            WH
          </span>
          <span>
            <strong>Warcry Herald</strong>
            <small>Campaign Ledger</small>
          </span>
        </a>
        <nav className="site-nav" aria-label="Primary navigation">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/campaigns">Campaigns</NavLink>
          {user ? <NavLink to="/profile">Profile</NavLink> : null}
        </nav>
        <div className="user-menu" aria-label="User menu">
          {!isConfigured ? (
            <span>Auth offline</span>
          ) : loading ? (
            <span>Checking session</span>
          ) : user ? (
            <>
              <span>{profile?.display_name ?? user.email ?? "Signed in"}</span>
              <button className="link-button" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/">Sign in</NavLink>
          )}
        </div>
      </header>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}
