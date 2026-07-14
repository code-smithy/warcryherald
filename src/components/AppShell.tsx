import { NavLink, Outlet } from "react-router-dom";
import { ErrorBoundary } from "../app/ErrorBoundary";

export function AppShell() {
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
        </nav>
      </header>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}
