import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  archiveCampaign,
  campaignRoleLabels,
  campaignStatusLabels,
  createCampaignInvite,
  deactivateCampaignInvite,
  getCampaign,
  getCampaignJoinUrl,
  getInviteState,
  listCampaignInvites,
  listCampaignMembers,
  removeCampaignMember,
  updateCampaign,
  updateCampaignMemberRole,
  type Campaign,
  type CampaignDraft,
  type CampaignInvite,
  type CampaignMember,
  type CampaignMemberRole,
  type CampaignStatus,
  type InviteDraft
} from "../lib/campaigns";
import { useAuth } from "../lib/auth-context";
import { getErrorMessage } from "../lib/errors";
import { getSupabaseClient } from "../lib/supabase";

const emptyInviteDraft: InviteDraft = {
  maxUses: "",
  expiresAt: ""
};

export function CampaignDetailPage() {
  const { campaignId } = useParams();
  const client = getSupabaseClient();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [invites, setInvites] = useState<CampaignInvite[]>([]);
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft>({
    name: "",
    description: "",
    status: "draft"
  });
  const [inviteDraft, setInviteDraft] = useState(emptyInviteDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentMember = useMemo(
    () => members.find((member) => member.user_id === user?.id) ?? null,
    [members, user?.id]
  );
  const isOwner = currentMember?.role === "owner";
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "campaign_admin";

  const loadCampaign = useCallback(async () => {
    if (!client || !campaignId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [nextCampaign, nextMembers] = await Promise.all([
        getCampaign(client, campaignId),
        listCampaignMembers(client, campaignId)
      ]);
      const nextInvites =
        nextMembers.some(
          (member) =>
            member.user_id === user?.id &&
            (member.role === "owner" || member.role === "campaign_admin")
        )
          ? await listCampaignInvites(client, campaignId)
          : [];

      setCampaign(nextCampaign);
      setMembers(nextMembers);
      setInvites(nextInvites);
      setCampaignDraft({
        name: nextCampaign.name,
        description: nextCampaign.description,
        status: nextCampaign.status === "archived" ? "completed" : nextCampaign.status
      });
    } catch (loadError) {
      setError(
        getErrorMessage(loadError, "Campaign could not be loaded.")
      );
    } finally {
      setLoading(false);
    }
  }, [campaignId, client, user?.id]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  async function handleCampaignUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client || !campaign) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const updated = await updateCampaign(client, campaign.id, campaignDraft);
      setCampaign(updated);
      setMessage("Campaign settings saved.");
    } catch (saveError) {
      setError(
        getErrorMessage(saveError, "Campaign settings could not be saved.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!client || !campaign) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const archived = await archiveCampaign(client, campaign.id);
      setCampaign(archived);
      setMessage("Campaign archived.");
    } catch (archiveError) {
      setError(
        getErrorMessage(archiveError, "Campaign could not be archived.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleInviteCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client || !campaign || !user) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const invite = await createCampaignInvite(client, campaign.id, inviteDraft, user.id);
      setInvites([invite, ...invites]);
      setInviteDraft(emptyInviteDraft);
      setMessage("Invite link created.");
    } catch (inviteError) {
      setError(
        getErrorMessage(inviteError, "Invite link could not be created.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleInviteDeactivate(inviteId: string) {
    if (!client) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await deactivateCampaignInvite(client, inviteId);
      await loadCampaign();
      setMessage("Invite link disabled.");
    } catch (inviteError) {
      setError(
        getErrorMessage(inviteError, "Invite link could not be disabled.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId: string, role: Exclude<CampaignMemberRole, "owner">) {
    if (!client || !campaign) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await updateCampaignMemberRole(client, campaign.id, userId, role);
      await loadCampaign();
      setMessage("Member role updated.");
    } catch (roleError) {
      setError(
        getErrorMessage(roleError, "Member role could not be updated.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleMemberRemove(userId: string) {
    if (!client || !campaign) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await removeCampaignMember(client, campaign.id, userId);
      await loadCampaign();
      setMessage(userId === user?.id ? "You left the campaign." : "Member removed.");
    } catch (removeError) {
      setError(
        getErrorMessage(removeError, "Member could not be removed.")
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="page page--narrow">
        <section className="notice" aria-live="polite">
          <p className="eyebrow">Campaign ledger</p>
          <h1>Loading campaign.</h1>
        </section>
      </main>
    );
  }

  if (!campaign) {
    return (
      <main className="page page--narrow">
        <section className="notice notice--danger" role="alert">
          <p className="eyebrow">Unavailable</p>
          <h1>Campaign not found.</h1>
          <p>{error ?? "The campaign is unavailable or you are not a member."}</p>
          <Link className="button button--secondary" to="/campaigns">
            Back to campaigns
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Campaign overview</p>
          <h1>{campaign.name}</h1>
          <p>{campaign.description || "No campaign description."}</p>
        </div>
        <span className={`status-pill status-pill--${campaign.status}`}>
          {campaignStatusLabels[campaign.status]}
        </span>
      </section>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="dashboard-grid">
        <article className="panel">
          <p className="eyebrow">Roster access</p>
          <h2>Members</h2>
          <div className="member-list">
            {members.map((member) => (
              <div className="member-row" key={member.user_id}>
                <span>
                  <strong>
                    {member.profiles?.display_name ??
                      member.profiles?.discord_user_id ??
                      member.user_id}
                  </strong>
                  <small>{campaignRoleLabels[member.role]}</small>
                </span>
                {isAdmin && member.role !== "owner" ? (
                  <select
                    aria-label={`Role for ${member.user_id}`}
                    value={member.role}
                    disabled={saving}
                    onChange={(event) =>
                      void handleRoleChange(
                        member.user_id,
                        event.target.value as Exclude<CampaignMemberRole, "owner">
                      )
                    }
                  >
                    <option value="player">Player</option>
                    <option value="campaign_admin">Campaign admin</option>
                  </select>
                ) : null}
                {(isAdmin && member.role !== "owner") || member.user_id === user?.id ? (
                  <button
                    className="link-button"
                    type="button"
                    disabled={saving}
                    onClick={() => void handleMemberRemove(member.user_id)}
                  >
                    {member.user_id === user?.id ? "Leave" : "Remove"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">Invitations</p>
          <h2>Invite management</h2>
          {isAdmin ? (
            <>
              <form className="inline-form" onSubmit={handleInviteCreate}>
                <label>
                  Max uses
                  <input
                    inputMode="numeric"
                    value={inviteDraft.maxUses}
                    onChange={(event) =>
                      setInviteDraft({ ...inviteDraft, maxUses: event.target.value })
                    }
                    placeholder="Unlimited"
                  />
                </label>
                <label>
                  Expires
                  <input
                    type="datetime-local"
                    value={inviteDraft.expiresAt}
                    onChange={(event) =>
                      setInviteDraft({ ...inviteDraft, expiresAt: event.target.value })
                    }
                  />
                </label>
                <button className="button" type="submit" disabled={saving}>
                  Create invite
                </button>
              </form>
              <div className="invite-list">
                {invites.length === 0 ? <p className="muted">No invite links yet.</p> : null}
                {invites.map((invite) => (
                  <div className="invite-row" key={invite.id}>
                    <code>{getCampaignJoinUrl(invite.token)}</code>
                    <span>{getInviteState(invite)}</span>
                    <small>
                      {invite.use_count}
                      {invite.max_uses === null ? " uses" : ` / ${invite.max_uses} uses`}
                    </small>
                    {!invite.disabled_at ? (
                      <button
                        className="link-button"
                        type="button"
                        disabled={saving}
                        onClick={() => void handleInviteDeactivate(invite.id)}
                      >
                        Disable
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Only campaign owners and administrators can manage invites.</p>
          )}
        </article>

        <article className="panel">
          <p className="eyebrow">Settings</p>
          <h2>Campaign settings</h2>
          {isAdmin ? (
            <form className="form-grid" onSubmit={handleCampaignUpdate}>
              <label>
                Name
                <input
                  value={campaignDraft.name}
                  onChange={(event) =>
                    setCampaignDraft({ ...campaignDraft, name: event.target.value })
                  }
                  required
                  minLength={3}
                  maxLength={80}
                />
              </label>
              <label>
                Description
                <textarea
                  value={campaignDraft.description}
                  onChange={(event) =>
                    setCampaignDraft({
                      ...campaignDraft,
                      description: event.target.value
                    })
                  }
                  rows={5}
                  maxLength={2000}
                />
              </label>
              <label>
                Status
                <select
                  value={campaignDraft.status}
                  onChange={(event) =>
                    setCampaignDraft({
                      ...campaignDraft,
                      status: event.target.value as CampaignStatus
                    })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <button className="button" type="submit" disabled={saving}>
                Save settings
              </button>
            </form>
          ) : (
            <p className="muted">Only campaign owners and administrators can change settings.</p>
          )}
          {isOwner && campaign.status !== "archived" ? (
            <button
              className="button button--secondary"
              type="button"
              disabled={saving}
              onClick={() => void handleArchive()}
            >
              Archive campaign
            </button>
          ) : null}
        </article>
      </section>
    </main>
  );
}
