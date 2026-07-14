import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Narrative campaign command</p>
          <h1>Track the warbands, battles, and scars that shape a campaign.</h1>
          <p>
            Warcry Herald will manage campaign membership, versioned reference
            data, warband rosters, aftermath, and chronicle entries with
            authorization enforced by Supabase Row-Level Security.
          </p>
          <Link className="button" to="/campaigns">
            Open campaign ledger
          </Link>
        </div>
      </section>
      <section className="foundation-grid" aria-label="Project foundation">
        <article>
          <h2>Campaign security boundary</h2>
          <p>
            Campaign membership and role checks are the core tenancy model for
            all private player data.
          </p>
        </article>
        <article>
          <h2>Versioned rules data</h2>
          <p>
            Fighter profiles and other reference records will be tied to rules
            releases so older rosters and battles remain understandable.
          </p>
        </article>
        <article>
          <h2>Static deployment</h2>
          <p>
            The frontend is built as a static application that can be hosted on
            GitHub Pages.
          </p>
        </article>
      </section>
    </main>
  );
}
