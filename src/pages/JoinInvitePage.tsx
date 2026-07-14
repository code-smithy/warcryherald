import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { acceptCampaignInvite } from "../lib/campaigns";
import { getSupabaseClient } from "../lib/supabase";

export function JoinInvitePage() {
  const { inviteToken } = useParams();
  const client = getSupabaseClient();
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    if (!client || !inviteToken) {
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const result = await acceptCampaignInvite(client, inviteToken);
      setCampaignId(result.campaign_id);
    } catch (joinError) {
      setError(
        joinError instanceof Error ? joinError.message : "Campaign invitation could not be accepted."
      );
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="page page--narrow">
      <section className="notice">
        <p className="eyebrow">Campaign invitation</p>
        <h1>Join campaign.</h1>
        {campaignId ? (
          <>
            <p>Your campaign membership is active.</p>
            <Link className="button" to={`/campaigns/${campaignId}`}>
              Open campaign
            </Link>
          </>
        ) : (
          <>
            <p>Accept this invitation to join the campaign as a player.</p>
            <button className="button" type="button" disabled={joining} onClick={handleJoin}>
              {joining ? "Joining..." : "Join campaign"}
            </button>
          </>
        )}
        {error ? <p className="form-error">{error}</p> : null}
      </section>
    </main>
  );
}
