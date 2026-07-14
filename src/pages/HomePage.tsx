import { Link } from "react-router-dom";
import { SignInPanel } from "../components/SignInPanel";
import { useAuth } from "../lib/auth-context";

export function HomePage() {
  const { user } = useAuth();

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Narrative campaign command</p>
          <h1>Track the warbands, battles, and scars that shape a campaign.</h1>
          <p>
            Sign in with Discord to keep your player profile ready for campaign
            membership, rosters, battles, aftermath, and chronicle entries.
          </p>
          <div className="hero-actions">
            <SignInPanel />
            {user ? (
              <Link className="button button--secondary" to="/campaigns">
                Open campaign ledger
              </Link>
            ) : null}
          </div>
        </div>
      </section>
      <section className="foundation-grid" aria-label="Project foundation">
        <article>
          <h2>Discord authentication</h2>
          <p>
            Supabase Auth handles Discord login, persistent browser sessions,
            and sign out.
          </p>
        </article>
        <article>
          <h2>Player profiles</h2>
          <p>
            Profiles store Discord metadata plus editable display name,
            language, and timezone settings.
          </p>
        </article>
        <article>
          <h2>Database authorization</h2>
          <p>
            Row-Level Security keeps profiles and campaign records scoped to
            authorized users.
          </p>
        </article>
      </section>
    </main>
  );
}
