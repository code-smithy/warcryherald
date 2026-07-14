import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  archiveCampaign,
  campaignRoleLabels,
  campaignStatusLabels,
  createCampaignInvite,
  deactivateCampaignInvite,
  editableCampaignStatuses,
  getCampaign,
  getDefaultInviteExpiresAt,
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
  type CampaignMemberProfile,
  type CampaignMemberRole,
  type CampaignStatus,
  type InviteDraft
} from "../lib/campaigns";
import { useAuth } from "../lib/auth-context";
import { getErrorMessage } from "../lib/errors";
import {
  getNewestRulesRelease,
  getSingle,
  listFactions,
  listFighterProfiles,
  listRulesReleases,
  type Faction,
  type FighterProfile,
  type RulesRelease
} from "../lib/reference-data";
import { getSupabaseClient } from "../lib/supabase";
import {
  addWarbandFighter,
  createWarband,
  fighterStatusLabels,
  getFighterSnapshot,
  getWarbandFaction,
  listWarbands,
  removeWarbandFighter,
  updateWarband,
  updateWarbandFighter,
  validateWarbandDraft,
  validateWarbandRoster,
  warbandStatusLabels,
  type Warband,
  type WarbandFighter,
  type WarbandFighterStatus
} from "../lib/warbands";

function createInviteDraft(): InviteDraft {
  return {
    maxUses: "",
    expiresAt: getDefaultInviteExpiresAt()
  };
}

export function CampaignDetailPage() {
  const { campaignId } = useParams();
  const client = getSupabaseClient();
  const { profile, user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [invites, setInvites] = useState<CampaignInvite[]>([]);
  const [warbands, setWarbands] = useState<Warband[]>([]);
  const [rulesReleases, setRulesReleases] = useState<RulesRelease[]>([]);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [fighterProfiles, setFighterProfiles] = useState<FighterProfile[]>([]);
  const [selectedWarbandId, setSelectedWarbandId] = useState<string | null>(null);
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft>({
    name: "",
    description: "",
    status: "draft",
    rulesReleaseId: "",
    warbandPointsLimit: "1000",
    warbandFighterMinimum: "3",
    warbandFighterLimit: "15"
  });
  const [warbandDraft, setWarbandDraft] = useState({ name: "", factionId: "" });
  const [fighterDraft, setFighterDraft] = useState({
    fighterProfileId: "",
    name: "",
    isLeader: false
  });
  const [inviteDraft, setInviteDraft] = useState(createInviteDraft);
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
  const selectedWarband =
    warbands.find((warband) => warband.id === selectedWarbandId) ?? warbands[0] ?? null;
  const selectedFighterProfile =
    fighterProfiles.find((fighter) => fighter.id === fighterDraft.fighterProfileId) ?? null;
  const defaultRulesRelease = useMemo(
    () => getNewestRulesRelease(rulesReleases),
    [rulesReleases]
  );
  const effectiveRulesReleaseId =
    campaign?.rules_release_id ?? campaignDraft.rulesReleaseId ?? defaultRulesRelease?.id ?? "";
  const rulesAreLocked = Boolean(campaign?.rules_locked || campaign?.status !== "draft");
  const availableFactions = useMemo(
    () =>
      factions.filter(
        (faction) =>
          effectiveRulesReleaseId &&
          faction.rules_release_id === effectiveRulesReleaseId
      ),
    [effectiveRulesReleaseId, factions]
  );
  const availableFighterProfiles = useMemo(
    () =>
      selectedWarband
        ? fighterProfiles.filter((fighter) => {
            const faction = getSingle(fighter.factions);
            const release = getSingle(fighter.rules_releases);

            return (
              faction?.id === selectedWarband.faction_id &&
              release?.id === selectedWarband.rules_release_id &&
              fighter.is_current
            );
          })
        : [],
    [fighterProfiles, selectedWarband]
  );

  const loadCampaign = useCallback(async () => {
    if (!client || !campaignId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [
        nextCampaign,
        nextMembers,
        nextWarbands,
        nextReleases,
        nextFactions,
        nextFighterProfiles
      ] = await Promise.all([
        getCampaign(client, campaignId),
        listCampaignMembers(client, campaignId),
        listWarbands(client, campaignId),
        listRulesReleases(client),
        listFactions(client),
        listFighterProfiles(client)
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
      setWarbands(nextWarbands);
      setRulesReleases(nextReleases);
      setFactions(nextFactions);
      setFighterProfiles(nextFighterProfiles);
      setSelectedWarbandId((current) => current ?? nextWarbands[0]?.id ?? null);
      const defaultReleaseId = nextCampaign.rules_release_id ?? getNewestRulesRelease(nextReleases)?.id ?? "";
      setCampaignDraft({
        name: nextCampaign.name,
        description: nextCampaign.description,
        status: nextCampaign.status,
        rulesReleaseId: defaultReleaseId,
        warbandPointsLimit: String(nextCampaign.warband_points_limit),
        warbandFighterMinimum: String(nextCampaign.warband_fighter_minimum),
        warbandFighterLimit: String(nextCampaign.warband_fighter_limit)
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

  async function handleWarbandCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client || !campaign) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { errors } = validateWarbandDraft(warbandDraft);

      if (errors.length > 0) {
        throw new Error(errors.join(" "));
      }

      if (!campaign.rules_release_id && effectiveRulesReleaseId) {
        await updateCampaign(client, campaign.id, {
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          rulesReleaseId: effectiveRulesReleaseId,
          warbandPointsLimit: campaignDraft.warbandPointsLimit,
          warbandFighterMinimum: campaignDraft.warbandFighterMinimum,
          warbandFighterLimit: campaignDraft.warbandFighterLimit
        });
      }

      const warband = await createWarband(client, {
        campaignId: campaign.id,
        factionId: warbandDraft.factionId,
        name: warbandDraft.name
      });
      setWarbandDraft({ name: "", factionId: "" });
      setSelectedWarbandId(warband.id);
      await loadCampaign();
      setMessage("Warband created.");
    } catch (warbandError) {
      setError(getErrorMessage(warbandError, "Warband could not be created."));
    } finally {
      setSaving(false);
    }
  }

  async function handleWarbandStatusChange(warbandId: string, status: Warband["status"]) {
    if (!client) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await updateWarband(client, warbandId, { status });
      await loadCampaign();
      setMessage(status === "battle_ready" ? "Warband marked battle-ready." : "Warband updated.");
    } catch (warbandError) {
      setError(getErrorMessage(warbandError, "Warband could not be updated."));
    } finally {
      setSaving(false);
    }
  }

  async function handleFighterAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client || !selectedWarband) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await addWarbandFighter(client, {
        warbandId: selectedWarband.id,
        fighterProfileId: fighterDraft.fighterProfileId,
        name: fighterDraft.name || selectedFighterProfile?.name || "",
        isLeader: fighterDraft.isLeader
      });
      setFighterDraft({ fighterProfileId: "", name: "", isLeader: false });
      await loadCampaign();
      setMessage("Fighter added.");
    } catch (fighterError) {
      setError(getErrorMessage(fighterError, "Fighter could not be added."));
    } finally {
      setSaving(false);
    }
  }

  async function handleFighterUpdate(
    fighterId: string,
    fields: Parameters<typeof updateWarbandFighter>[2]
  ) {
    if (!client) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await updateWarbandFighter(client, fighterId, fields);
      await loadCampaign();
      setMessage("Fighter updated.");
    } catch (fighterError) {
      setError(getErrorMessage(fighterError, "Fighter could not be updated."));
    } finally {
      setSaving(false);
    }
  }

  async function handleFighterRemove(fighterId: string) {
    if (!client) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await removeWarbandFighter(client, fighterId);
      await loadCampaign();
      setMessage("Fighter removed.");
    } catch (fighterError) {
      setError(getErrorMessage(fighterError, "Fighter could not be removed."));
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
      setInviteDraft(createInviteDraft());
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
        <article className="panel warband-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Warbands</p>
              <h2>Roster management</h2>
            </div>
            <button className="button button--secondary" type="button" onClick={() => window.print()}>
              Print roster
            </button>
          </div>

          {!campaign.rules_release_id && effectiveRulesReleaseId ? (
            <p className="muted">
              The newest rules release is selected by default and will be saved with the first
              warband.
            </p>
          ) : null}

          {!effectiveRulesReleaseId ? (
            <p className="muted">
              Choose a campaign rules release in settings before creating warbands.
            </p>
          ) : null}

          <form className="inline-form" onSubmit={handleWarbandCreate}>
            <label>
              Warband name
              <input
                value={warbandDraft.name}
                onChange={(event) =>
                  setWarbandDraft({ ...warbandDraft, name: event.target.value })
                }
                minLength={2}
                maxLength={80}
                disabled={!effectiveRulesReleaseId}
              />
            </label>
            <label>
              Faction
              <select
                value={warbandDraft.factionId}
                onChange={(event) =>
                  setWarbandDraft({ ...warbandDraft, factionId: event.target.value })
                }
                disabled={!effectiveRulesReleaseId || availableFactions.length === 0}
              >
                <option value="">Choose faction</option>
                {availableFactions.map((faction) => (
                  <option key={faction.id} value={faction.id}>
                    {faction.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button" type="submit" disabled={saving || !effectiveRulesReleaseId}>
              Create warband
            </button>
          </form>

          {availableFactions.length === 0 && effectiveRulesReleaseId ? (
            <p className="muted">No factions are available for the configured rules release.</p>
          ) : null}

          <WarbandRoster
            warbands={warbands}
            selectedWarband={selectedWarband}
            canManage={Boolean(
              selectedWarband &&
                (isAdmin || selectedWarband.owner_id === user?.id)
            )}
            fighterProfiles={availableFighterProfiles}
            fighterDraft={fighterDraft}
            selectedFighterProfile={selectedFighterProfile}
            saving={saving}
            onSelect={setSelectedWarbandId}
            onFighterDraftChange={setFighterDraft}
            onAddFighter={handleFighterAdd}
            onFighterUpdate={handleFighterUpdate}
            onFighterRemove={handleFighterRemove}
            onWarbandStatusChange={handleWarbandStatusChange}
          />
        </article>

        <article className="panel">
          <p className="eyebrow">Roster access</p>
          <h2>Members</h2>
          <div className="member-list">
            {members.map((member) => (
              <div className="member-row" key={member.user_id}>
                <span>
                  <strong>
                    {getMemberDisplayName(member, {
                      currentUserEmail: user?.email ?? null,
                      currentUserId: user?.id ?? null,
                      currentUserProfileName: profile?.display_name ?? null
                    })}
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
              <form className="invite-form" onSubmit={handleInviteCreate}>
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
                  {editableCampaignStatuses.map((status) => (
                    <option key={status} value={status}>
                      {campaignStatusLabels[status]}
                    </option>
                  ))}
                  {campaign.status === "archived" || isOwner ? (
                    <option value="archived">Archived</option>
                  ) : null}
                </select>
              </label>
              <label>
                Rules release
                <select
                  value={campaignDraft.rulesReleaseId ?? ""}
                  disabled={rulesAreLocked || rulesReleases.length === 0}
                  onChange={(event) =>
                    setCampaignDraft({
                      ...campaignDraft,
                      rulesReleaseId: event.target.value
                    })
                  }
                >
                  {rulesReleases.length === 0 ? (
                    <option value="">No releases available</option>
                  ) : null}
                  {rulesReleases.map((release) => (
                    <option key={release.id} value={release.id}>
                      {release.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Warband point limit
                <input
                  inputMode="numeric"
                  value={campaignDraft.warbandPointsLimit ?? ""}
                  disabled={rulesAreLocked}
                  onChange={(event) =>
                    setCampaignDraft({
                      ...campaignDraft,
                      warbandPointsLimit: event.target.value
                    })
                  }
                />
              </label>
              <label>
                Warband fighter minimum
                <input
                  inputMode="numeric"
                  value={campaignDraft.warbandFighterMinimum ?? ""}
                  disabled={rulesAreLocked}
                  onChange={(event) =>
                    setCampaignDraft({
                      ...campaignDraft,
                      warbandFighterMinimum: event.target.value
                    })
                  }
                />
              </label>
              <label>
                Warband fighter maximum
                <input
                  inputMode="numeric"
                  value={campaignDraft.warbandFighterLimit ?? ""}
                  disabled={rulesAreLocked}
                  onChange={(event) =>
                    setCampaignDraft({
                      ...campaignDraft,
                      warbandFighterLimit: event.target.value
                    })
                  }
                />
              </label>
              {rulesAreLocked ? (
                <p className="muted">
                  Rules release and starting roster limits are locked after the campaign starts.
                </p>
              ) : null}
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

function getMemberDisplayName(
  member: CampaignMember,
  currentUser: {
    currentUserEmail: string | null;
    currentUserId: string | null;
    currentUserProfileName: string | null;
  }
) {
  const relatedProfile = normalizeRelatedProfile(member.profiles);

  if (relatedProfile?.display_name) {
    return relatedProfile.display_name;
  }

  if (member.user_id === currentUser.currentUserId) {
    return currentUser.currentUserProfileName || currentUser.currentUserEmail || "You";
  }

  if (relatedProfile?.discord_user_id) {
    return `Discord ${relatedProfile.discord_user_id}`;
  }

  return `Player ${member.user_id.slice(0, 8)}`;
}

function normalizeRelatedProfile(
  profile: CampaignMember["profiles"]
): CampaignMemberProfile | null {
  if (Array.isArray(profile)) {
    return profile[0] ?? null;
  }

  return profile ?? null;
}

function WarbandRoster({
  warbands,
  selectedWarband,
  canManage,
  fighterProfiles,
  fighterDraft,
  selectedFighterProfile,
  saving,
  onSelect,
  onFighterDraftChange,
  onAddFighter,
  onFighterUpdate,
  onFighterRemove,
  onWarbandStatusChange
}: {
  warbands: Warband[];
  selectedWarband: Warband | null;
  canManage: boolean;
  fighterProfiles: FighterProfile[];
  fighterDraft: { fighterProfileId: string; name: string; isLeader: boolean };
  selectedFighterProfile: FighterProfile | null;
  saving: boolean;
  onSelect: (warbandId: string) => void;
  onFighterDraftChange: (draft: { fighterProfileId: string; name: string; isLeader: boolean }) => void;
  onAddFighter: (event: React.FormEvent<HTMLFormElement>) => void;
  onFighterUpdate: (
    fighterId: string,
    fields: Parameters<typeof updateWarbandFighter>[2]
  ) => void;
  onFighterRemove: (fighterId: string) => void;
  onWarbandStatusChange: (warbandId: string, status: Warband["status"]) => void;
}) {
  if (warbands.length === 0) {
    return <p className="muted">No warbands yet.</p>;
  }

  if (!selectedWarband) {
    return null;
  }

  const validation = validateWarbandRoster(selectedWarband);
  const rosterFighters = [...(selectedWarband.warband_fighters ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
  );
  const faction = getWarbandFaction(selectedWarband);

  return (
    <div className="warband-layout">
      <div className="warband-list">
        {warbands.map((warband) => {
          const warbandValidation = validateWarbandRoster(warband);
          const warbandFaction = getWarbandFaction(warband);

          return (
            <button
              className="reference-row"
              key={warband.id}
              type="button"
              aria-pressed={warband.id === selectedWarband.id}
              onClick={() => onSelect(warband.id)}
            >
              <span>
                <strong>{warband.name}</strong>
                <small>
                  {warbandFaction?.name ?? "Unknown faction"} - {warbandValidation.totalPoints} pts
                </small>
              </span>
              <span className="status-pill">{warbandStatusLabels[warband.status]}</span>
            </button>
          );
        })}
      </div>

      <div className="warband-detail">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{faction?.name ?? "Unknown faction"}</p>
            <h3>{selectedWarband.name}</h3>
          </div>
          <span className="status-pill">{warbandStatusLabels[selectedWarband.status]}</span>
        </div>

        <dl className="stat-grid">
          <div>
            <dt>Points</dt>
            <dd>
              {validation.totalPoints}/{selectedWarband.points_limit}
            </dd>
          </div>
          <div>
            <dt>Fighters</dt>
            <dd>
              {validation.fighterCount}/{selectedWarband.fighter_minimum}-{selectedWarband.fighter_limit}
            </dd>
          </div>
          <div>
            <dt>Leader</dt>
            <dd>{validation.errors.some((issue) => issue.code === "missing-leader") ? "No" : "Yes"}</dd>
          </div>
          <div>
            <dt>Roster</dt>
            <dd>{validation.valid ? "Valid" : "Draft"}</dd>
          </div>
        </dl>

        {validation.errors.length > 0 || validation.warnings.length > 0 ? (
          <div className="validation-list" aria-live="polite">
            {validation.errors.map((issue) => (
              <p className="form-error" key={issue.code}>
                {issue.message}
              </p>
            ))}
            {validation.warnings.map((issue) => (
              <p className="muted" key={issue.code}>
                {issue.message}
              </p>
            ))}
          </div>
        ) : null}

        {canManage ? (
          <div className="hero-actions">
            {selectedWarband.status === "draft" ? (
              <button
                className="button"
                type="button"
                disabled={saving || !validation.valid}
                onClick={() => onWarbandStatusChange(selectedWarband.id, "battle_ready")}
              >
                Mark battle-ready
              </button>
            ) : null}
            {selectedWarband.status === "battle_ready" ? (
              <button
                className="button button--secondary"
                type="button"
                disabled={saving}
                onClick={() => onWarbandStatusChange(selectedWarband.id, "draft")}
              >
                Return to draft
              </button>
            ) : null}
            {selectedWarband.status !== "retired" ? (
              <button
                className="button button--secondary"
                type="button"
                disabled={saving}
                onClick={() => onWarbandStatusChange(selectedWarband.id, "retired")}
              >
                Retire warband
              </button>
            ) : null}
          </div>
        ) : null}

        {canManage ? (
          <form className="inline-form" onSubmit={onAddFighter}>
            <label>
              Fighter profile
              <select
                value={fighterDraft.fighterProfileId}
                onChange={(event) =>
                  onFighterDraftChange({
                    fighterProfileId: event.target.value,
                    name: "",
                    isLeader: false
                  })
                }
              >
                <option value="">Choose fighter</option>
                {fighterProfiles.map((fighter) => (
                  <option key={fighter.id} value={fighter.id}>
                    {fighter.name} - {fighter.points} pts
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input
                value={fighterDraft.name}
                onChange={(event) =>
                  onFighterDraftChange({ ...fighterDraft, name: event.target.value })
                }
                placeholder={selectedFighterProfile?.name ?? "Fighter name"}
                maxLength={80}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={fighterDraft.isLeader}
                disabled={!selectedFighterProfile?.is_leader}
                onChange={(event) =>
                  onFighterDraftChange({ ...fighterDraft, isLeader: event.target.checked })
                }
              />
              Leader
            </label>
            <button className="button" type="submit" disabled={saving || !fighterDraft.fighterProfileId}>
              Add fighter
            </button>
          </form>
        ) : null}

        <div className="fighter-card-list">
          {rosterFighters.length === 0 ? <p className="muted">No fighters in this roster.</p> : null}
          {rosterFighters.map((fighter) => (
            <WarbandFighterCard
              key={fighter.id}
              fighter={fighter}
              canManage={canManage}
              saving={saving}
              onUpdate={onFighterUpdate}
              onRemove={onFighterRemove}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WarbandFighterCard({
  fighter,
  canManage,
  saving,
  onUpdate,
  onRemove
}: {
  fighter: WarbandFighter;
  canManage: boolean;
  saving: boolean;
  onUpdate: (
    fighterId: string,
    fields: Parameters<typeof updateWarbandFighter>[2]
  ) => void;
  onRemove: (fighterId: string) => void;
}) {
  const snapshot = getFighterSnapshot(fighter);
  const [name, setName] = useState(fighter.name);

  useEffect(() => {
    setName(fighter.name);
  }, [fighter.name]);

  return (
    <article className="fighter-card">
      <div>
        <h4>{fighter.name}</h4>
        <p className="muted">
          {snapshot?.name ?? "Unknown profile"} - {snapshot?.points ?? 0} pts
        </p>
      </div>

      {snapshot ? (
        <dl className="mini-stat-grid">
          <div>
            <dt>Move</dt>
            <dd>{snapshot.movement}</dd>
          </div>
          <div>
            <dt>Tough</dt>
            <dd>{snapshot.toughness}</dd>
          </div>
          <div>
            <dt>Wounds</dt>
            <dd>{snapshot.wounds}</dd>
          </div>
        </dl>
      ) : null}

      {canManage ? (
        <div className="fighter-card-controls">
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </label>
          <label>
            Status
            <select
              value={fighter.status}
              onChange={(event) =>
                onUpdate(fighter.id, {
                  status: event.target.value as WarbandFighterStatus
                })
              }
              disabled={saving}
            >
              {Object.entries(fighterStatusLabels).map(([status, label]) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={fighter.is_leader}
              disabled={saving || !snapshot?.is_leader}
              onChange={(event) =>
                onUpdate(fighter.id, { is_leader: event.target.checked })
              }
            />
            Leader
          </label>
          <button
            className="button button--secondary"
            type="button"
            disabled={saving || name.trim() === fighter.name}
            onClick={() => onUpdate(fighter.id, { name: name.trim() || fighter.name })}
          >
            Save
          </button>
          <button
            className="link-button"
            type="button"
            disabled={saving}
            onClick={() => onUpdate(fighter.id, { status: "retired" })}
          >
            Retire
          </button>
          <button
            className="link-button"
            type="button"
            disabled={saving}
            onClick={() => onRemove(fighter.id)}
          >
            Remove
          </button>
        </div>
      ) : (
        <p className="muted">{fighterStatusLabels[fighter.status]}</p>
      )}
    </article>
  );
}
