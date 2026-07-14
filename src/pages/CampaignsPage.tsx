import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  campaignStatusLabels,
  createCampaign,
  listCampaigns,
  type Campaign,
  type CampaignDraft,
  type CampaignStatus
} from "../lib/campaigns";
import { useAuth } from "../lib/auth-context";
import { getErrorMessage } from "../lib/errors";
import { getSupabaseClient } from "../lib/supabase";

const initialDraft: CampaignDraft = {
  name: "",
  description: "",
  status: "draft"
};

export function CampaignsPage() {
  const client = getSupabaseClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCampaigns() {
      if (!client) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const nextCampaigns = await listCampaigns(client);

        if (active) {
          setCampaigns(nextCampaigns);
        }
      } catch (loadError) {
        if (active) {
          setError(
            getErrorMessage(loadError, "Campaigns could not be loaded.")
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadCampaigns();

    return () => {
      active = false;
    };
  }, [client]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client || !user) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const campaign = await createCampaign(client, draft);
      setDraft(initialDraft);
      navigate(`/campaigns/${campaign.id}`);
    } catch (createError) {
      setError(
        getErrorMessage(createError, "Campaign could not be created.")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Campaign ledger</p>
          <h1>Campaigns</h1>
          <p>Create a campaign, open an existing ledger, or join through an invite link.</p>
        </div>
      </section>

      <section className="campaign-layout" aria-label="Campaign management">
        <form className="panel form-grid" onSubmit={handleCreate}>
          <div>
            <p className="eyebrow">New campaign</p>
            <h2>Create campaign</h2>
          </div>
          <label>
            Name
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="The Ashen Road"
              required
              minLength={3}
              maxLength={80}
            />
          </label>
          <label>
            Description
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              placeholder="Campaign notes, venue details, or house rules."
              rows={5}
              maxLength={2000}
            />
          </label>
          <label>
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value as CampaignStatus })
              }
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
            </select>
          </label>
          <button className="button" type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create campaign"}
          </button>
          {error ? <p className="form-error">{error}</p> : null}
        </form>

        <section className="panel campaign-list" aria-live="polite">
          <div>
            <p className="eyebrow">Your memberships</p>
            <h2>Open campaigns</h2>
          </div>
          {loading ? <p className="muted">Loading campaigns...</p> : null}
          {!loading && campaigns.length === 0 ? (
            <p className="muted">No campaign memberships yet.</p>
          ) : null}
          {campaigns.map((campaign) => (
            <Link className="campaign-row" key={campaign.id} to={`/campaigns/${campaign.id}`}>
              <span>
                <strong>{campaign.name}</strong>
                <small>{campaign.description || "No campaign description."}</small>
              </span>
              <span className={`status-pill status-pill--${campaign.status}`}>
                {campaignStatusLabels[campaign.status]}
              </span>
            </Link>
          ))}
        </section>
      </section>
    </main>
  );
}
