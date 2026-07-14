import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="page page--narrow">
      <section className="notice">
        <p className="eyebrow">Not found</p>
        <h1>This ledger page does not exist.</h1>
        <p>Return to the project foundation and choose an available route.</p>
        <Link className="button button--secondary" to="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
