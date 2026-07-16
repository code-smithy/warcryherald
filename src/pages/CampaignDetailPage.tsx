import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addBattleFighter,
  addBattleParticipant,
  battleResultLabels,
  battleStatusLabels,
  completeBattle,
  createBattle,
  createBattleDraft,
  getBattleParticipantName,
  getBattleParticipantPoints,
  getEligibleBattleFighters,
  listBattles,
  recordBattleResults,
  removeBattleFighter,
  removeBattleParticipant,
  type Battle,
  type BattleDraft,
  type BattleParticipantResult,
  type BattleResultDraft
} from "../lib/battles";
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
import {
  abandonWarbandQuest,
  addFighterHeroicTrait,
  addFighterInjury,
  addWarbandArtefact,
  assignFighterArtefact,
  completeWarbandQuest,
  createProgressionDraft,
  emptyProgressionState,
  filterProgressionDefinitionsForWarband,
  getDefinitionName,
  getWarbandProgressionState,
  listProgressionDefinitions,
  recoverFighterInjury,
  removeFighterHeroicTrait,
  removeWarbandArtefact,
  saveFighterRenown,
  saveWarbandProgress,
  setWarbandEncampment,
  startWarbandQuest,
  updateWarbandArtefactNotes,
  updateWarbandQuestProgress,
  type ArtefactDefinition,
  type FighterInjury,
  type HeroicTraitDefinition,
  type ProgressionDefinitions,
  type ProgressionDraft,
  type WarbandArtefact,
  type WarbandProgressionState,
  type WarbandQuest
} from "../lib/progression";
import { getSupabaseClient } from "../lib/supabase";
import {
  addWarbandFighter,
  createWarband,
  fighterStatusLabels,
  getFighterProfile,
  getFighterSnapshot,
  getWarbandFaction,
  getWarbandFighterPoints,
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

type CampaignTab = "warbands" | "battles" | "members" | "invites" | "settings";

const campaignTabs: Array<{ id: CampaignTab; label: string }> = [
  { id: "warbands", label: "Warbands" },
  { id: "battles", label: "Battles" },
  { id: "members", label: "Members" },
  { id: "invites", label: "Invites" },
  { id: "settings", label: "Settings" }
];

export function CampaignDetailPage() {
  const { campaignId } = useParams();
  const client = getSupabaseClient();
  const { profile, user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [invites, setInvites] = useState<CampaignInvite[]>([]);
  const [warbands, setWarbands] = useState<Warband[]>([]);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [rulesReleases, setRulesReleases] = useState<RulesRelease[]>([]);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [fighterProfiles, setFighterProfiles] = useState<FighterProfile[]>([]);
  const [selectedWarbandId, setSelectedWarbandId] = useState<string | null>(null);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
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
  const [battleDraft, setBattleDraft] = useState<BattleDraft>(createBattleDraft);
  const [inviteDraft, setInviteDraft] = useState(createInviteDraft);
  const [activeCampaignTab, setActiveCampaignTab] = useState<CampaignTab>("warbands");
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
  const selectedBattle =
    battles.find((battle) => battle.id === selectedBattleId) ?? battles[0] ?? null;
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
      [...factions]
        .filter((faction) => getSingle(faction.rules_releases)?.status !== "retired")
        .sort((left, right) => {
          const leftRelease = getSingle(left.rules_releases);
          const rightRelease = getSingle(right.rules_releases);

          if (
            left.rules_release_id === effectiveRulesReleaseId &&
            right.rules_release_id !== effectiveRulesReleaseId
          ) {
            return -1;
          }

          if (
            right.rules_release_id === effectiveRulesReleaseId &&
            left.rules_release_id !== effectiveRulesReleaseId
          ) {
            return 1;
          }

          const leftAlliance = getSingle(left.grand_alliances);
          const rightAlliance = getSingle(right.grand_alliances);
          const allianceDelta = (leftAlliance?.name ?? "").localeCompare(
            rightAlliance?.name ?? ""
          );

          if (allianceDelta !== 0) {
            return allianceDelta;
          }

          const orderDelta = (left.display_order ?? 0) - (right.display_order ?? 0);

          if (orderDelta !== 0) {
            return orderDelta;
          }

          const nameDelta = left.name.localeCompare(right.name);

          if (nameDelta !== 0) {
            return nameDelta;
          }

          return (leftRelease?.name ?? "").localeCompare(rightRelease?.name ?? "");
        }),
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
        nextBattles,
        nextReleases,
        nextFactions,
        nextFighterProfiles
      ] = await Promise.all([
        getCampaign(client, campaignId),
        listCampaignMembers(client, campaignId),
        listWarbands(client, campaignId),
        listBattles(client, campaignId),
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
      setBattles(nextBattles);
      setRulesReleases(nextReleases);
      setFactions(nextFactions);
      setFighterProfiles(nextFighterProfiles);
      setSelectedWarbandId((current) => current ?? nextWarbands[0]?.id ?? null);
      setSelectedBattleId((current) => current ?? nextBattles[0]?.id ?? null);
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
      await addWarbandFighter(
        client,
        {
          warbandId: selectedWarband.id,
          fighterProfileId: fighterDraft.fighterProfileId,
          name: fighterDraft.name || selectedFighterProfile?.name || "",
          isLeader: fighterDraft.isLeader,
          points: selectedFighterProfile?.points ?? 0
        },
        selectedWarband
      );
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

  async function handleBattleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client || !campaign) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const battle = await createBattle(client, campaign.id, battleDraft);
      setBattleDraft(createBattleDraft());
      setSelectedBattleId(battle.id);
      await loadCampaign();
      setMessage("Battle created.");
    } catch (battleError) {
      setError(getErrorMessage(battleError, "Battle could not be created."));
    } finally {
      setSaving(false);
    }
  }

  async function runBattleAction(action: () => Promise<unknown>, success: string) {
    if (!client) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await action();
      await loadCampaign();
      setMessage(success);
    } catch (battleError) {
      setError(getErrorMessage(battleError, "Battle could not be updated."));
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

      <nav className="tab-list" aria-label="Campaign sections">
        {campaignTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="tab-button"
            aria-selected={activeCampaignTab === tab.id}
            onClick={() => setActiveCampaignTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="dashboard-grid">
        <article className="panel warband-panel" hidden={activeCampaignTab !== "warbands"}>
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
                    {getSingle(faction.rules_releases)?.name
                      ? ` - ${getSingle(faction.rules_releases)?.name}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="button" type="submit" disabled={saving || !effectiveRulesReleaseId}>
              Create warband
            </button>
          </form>

          {availableFactions.length === 0 && effectiveRulesReleaseId ? (
            <p className="muted">
              No current factions are available from the imported reference data.
            </p>
          ) : null}

          <WarbandRoster
            client={client}
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
            onMessage={setMessage}
            onError={setError}
          />
        </article>

        {activeCampaignTab === "battles" ? (
          <BattlePanel
            battles={battles}
            warbands={warbands}
            selectedBattle={selectedBattle}
            battleDraft={battleDraft}
            canManageCampaign={isAdmin}
            saving={saving}
            onSelect={setSelectedBattleId}
            onDraftChange={setBattleDraft}
            onCreateBattle={handleBattleCreate}
            onAddParticipant={(battleId, warbandId) =>
              runBattleAction(
                () => addBattleParticipant(client!, battleId, warbandId),
                "Battle participant added."
              )
            }
            onRemoveParticipant={(participantId) =>
              runBattleAction(
                () => removeBattleParticipant(client!, participantId),
                "Battle participant removed."
              )
            }
            onAddFighter={(participantId, fighterId, allowUnavailable) =>
              runBattleAction(
                () => addBattleFighter(client!, participantId, fighterId, allowUnavailable),
                "Battle fighter added."
              )
            }
            onRemoveFighter={(battleFighterId) =>
              runBattleAction(
                () => removeBattleFighter(client!, battleFighterId),
                "Battle fighter removed."
              )
            }
            onRecordResults={(battleId, results) =>
              runBattleAction(
                () => recordBattleResults(client!, battleId, results),
                "Battle results recorded."
              )
            }
            onCompleteBattle={(battle) =>
              runBattleAction(() => completeBattle(client!, battle), "Battle completed.")
            }
          />
        ) : null}

        <article className="panel tab-panel" hidden={activeCampaignTab !== "members"}>
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

        <article className="panel tab-panel" hidden={activeCampaignTab !== "invites"}>
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

        <article className="panel tab-panel" hidden={activeCampaignTab !== "settings"}>
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

function BattlePanel({
  battles,
  warbands,
  selectedBattle,
  battleDraft,
  canManageCampaign,
  saving,
  onSelect,
  onDraftChange,
  onCreateBattle,
  onAddParticipant,
  onRemoveParticipant,
  onAddFighter,
  onRemoveFighter,
  onRecordResults,
  onCompleteBattle
}: {
  battles: Battle[];
  warbands: Warband[];
  selectedBattle: Battle | null;
  battleDraft: BattleDraft;
  canManageCampaign: boolean;
  saving: boolean;
  onSelect: (battleId: string) => void;
  onDraftChange: (draft: BattleDraft) => void;
  onCreateBattle: (event: React.FormEvent<HTMLFormElement>) => void;
  onAddParticipant: (battleId: string, warbandId: string) => Promise<unknown>;
  onRemoveParticipant: (participantId: string) => Promise<unknown>;
  onAddFighter: (
    participantId: string,
    fighterId: string,
    allowUnavailable: boolean
  ) => Promise<unknown>;
  onRemoveFighter: (battleFighterId: string) => Promise<unknown>;
  onRecordResults: (battleId: string, results: BattleResultDraft[]) => Promise<unknown>;
  onCompleteBattle: (battle: Battle) => Promise<unknown>;
}) {
  const [participantWarbandId, setParticipantWarbandId] = useState("");
  const [resultDrafts, setResultDrafts] = useState<Record<string, BattleResultDraft>>({});
  const [fighterDrafts, setFighterDrafts] = useState<Record<string, string>>({});

  const participants = useMemo(
    () => selectedBattle?.battle_participants ?? [],
    [selectedBattle?.battle_participants]
  );
  const participantWarbandIds = new Set(participants.map((participant) => participant.warband_id));
  const availableWarbands = warbands.filter((warband) => !participantWarbandIds.has(warband.id));
  const canChangeBattle =
    Boolean(selectedBattle) &&
    selectedBattle?.status !== "completed" &&
    selectedBattle?.status !== "cancelled";

  useEffect(() => {
    setResultDrafts(
      Object.fromEntries(
        participants.map((participant) => [
          participant.id,
          {
            participantId: participant.id,
            result: participant.result,
            score: String(participant.score),
            notes: participant.notes
          }
        ])
      )
    );
    setFighterDrafts({});
  }, [selectedBattle?.id, participants]);

  return (
    <article className="panel battle-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Battles</p>
          <h2>Battle records</h2>
        </div>
      </div>

      <form className="inline-form" onSubmit={onCreateBattle}>
        <label>
          Battleplan
          <input
            value={battleDraft.battleplanName}
            maxLength={120}
            onChange={(event) =>
              onDraftChange({ ...battleDraft, battleplanName: event.target.value })
            }
          />
        </label>
        <label>
          Location
          <input
            value={battleDraft.locationName}
            maxLength={120}
            onChange={(event) =>
              onDraftChange({ ...battleDraft, locationName: event.target.value })
            }
          />
        </label>
        <label>
          Scheduled
          <input
            type="datetime-local"
            value={battleDraft.scheduledAt}
            onChange={(event) =>
              onDraftChange({ ...battleDraft, scheduledAt: event.target.value })
            }
          />
        </label>
        <label className="progression-wide">
          Notes
          <input
            value={battleDraft.notes}
            maxLength={2000}
            onChange={(event) => onDraftChange({ ...battleDraft, notes: event.target.value })}
          />
        </label>
        <button className="button" type="submit" disabled={saving}>
          Create battle
        </button>
      </form>

      {battles.length === 0 ? <p className="muted">No battles recorded yet.</p> : null}

      {battles.length > 0 ? (
        <div className="battle-layout">
          <div className="warband-list">
            {battles.map((battle) => (
              <button
                className="reference-row"
                key={battle.id}
                type="button"
                aria-pressed={battle.id === selectedBattle?.id}
                onClick={() => onSelect(battle.id)}
              >
                <span>
                  <strong>{battle.battleplan_name || "Untitled battle"}</strong>
                  <small>
                    {battle.location_name || "No location"}
                    {battle.scheduled_at
                      ? ` - ${new Date(battle.scheduled_at).toLocaleString()}`
                      : ""}
                  </small>
                </span>
                <span className="status-pill">{battleStatusLabels[battle.status]}</span>
              </button>
            ))}
          </div>

          {selectedBattle ? (
            <div className="warband-detail">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{battleStatusLabels[selectedBattle.status]}</p>
                  <h3>{selectedBattle.battleplan_name || "Untitled battle"}</h3>
                  <p className="muted">{selectedBattle.notes || "No battle notes."}</p>
                </div>
              </div>

              <div className="progression-grid">
                <label>
                  Add participant
                  <select
                    value={participantWarbandId}
                    disabled={!canChangeBattle || availableWarbands.length === 0}
                    onChange={(event) => setParticipantWarbandId(event.target.value)}
                  >
                    <option value="">Choose warband</option>
                    {availableWarbands.map((warband) => (
                      <option key={warband.id} value={warband.id}>
                        {warband.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button"
                  type="button"
                  disabled={saving || !canChangeBattle || !participantWarbandId}
                  onClick={() =>
                    void onAddParticipant(selectedBattle.id, participantWarbandId).then(() =>
                      setParticipantWarbandId("")
                    )
                  }
                >
                  Add warband
                </button>
              </div>

              <div className="progression-list">
                {participants.map((participant) => {
                  const participantWarband =
                    warbands.find((warband) => warband.id === participant.warband_id) ??
                    participant.warbands;
                  const eligibleFighters = getEligibleBattleFighters(
                    participant,
                    participantWarband,
                    canManageCampaign
                  );
                  const resultDraft = resultDrafts[participant.id] ?? {
                    participantId: participant.id,
                    result: participant.result,
                    score: String(participant.score),
                    notes: participant.notes
                  };

                  return (
                    <div className="progression-row progression-row--stacked" key={participant.id}>
                      <div className="section-heading">
                        <div>
                          <strong>{getBattleParticipantName(participant)}</strong>
                          <small>
                            {getBattleParticipantPoints(participant)} pts selected -{" "}
                            {(participant.battle_fighters ?? []).length} fighters
                          </small>
                        </div>
                        {canChangeBattle ? (
                          <button
                            className="link-button"
                            type="button"
                            disabled={saving}
                            onClick={() => void onRemoveParticipant(participant.id)}
                          >
                            Remove participant
                          </button>
                        ) : null}
                      </div>

                      <div className="progression-grid">
                        <label>
                          Result
                          <select
                            value={resultDraft.result}
                            disabled={!canChangeBattle}
                            onChange={(event) =>
                              setResultDrafts({
                                ...resultDrafts,
                                [participant.id]: {
                                  ...resultDraft,
                                  result: event.target.value as BattleParticipantResult
                                }
                              })
                            }
                          >
                            {Object.entries(battleResultLabels).map(([result, label]) => (
                              <option key={result} value={result}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Score
                          <input
                            inputMode="numeric"
                            value={resultDraft.score}
                            disabled={!canChangeBattle}
                            onChange={(event) =>
                              setResultDrafts({
                                ...resultDrafts,
                                [participant.id]: { ...resultDraft, score: event.target.value }
                              })
                            }
                          />
                        </label>
                        <label>
                          Result notes
                          <input
                            value={resultDraft.notes}
                            maxLength={1000}
                            disabled={!canChangeBattle}
                            onChange={(event) =>
                              setResultDrafts({
                                ...resultDrafts,
                                [participant.id]: { ...resultDraft, notes: event.target.value }
                              })
                            }
                          />
                        </label>
                      </div>

                      <div className="tag-list">
                        {(participant.battle_fighters ?? []).map((fighter) => (
                          <span key={fighter.id}>
                            {fighter.name} ({fighter.points} pts)
                            {canChangeBattle ? (
                              <button
                                className="tag-remove"
                                type="button"
                                disabled={saving}
                                onClick={() => void onRemoveFighter(fighter.id)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </span>
                        ))}
                      </div>

                      {canChangeBattle ? (
                        <div className="inline-form">
                          <label>
                            Include fighter
                            <select
                              value={fighterDrafts[participant.id] ?? ""}
                              disabled={eligibleFighters.length === 0}
                              onChange={(event) =>
                                setFighterDrafts({
                                  ...fighterDrafts,
                                  [participant.id]: event.target.value
                                })
                              }
                            >
                              <option value="">Choose fighter</option>
                              {eligibleFighters.map((fighter) => (
                                <option key={fighter.id} value={fighter.id}>
                                  {fighter.name} - {fighterStatusLabels[fighter.status]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="button button--secondary"
                            type="button"
                            disabled={saving || !fighterDrafts[participant.id]}
                            onClick={() =>
                              void onAddFighter(
                                participant.id,
                                fighterDrafts[participant.id] ?? "",
                                canManageCampaign
                              ).then(() =>
                                setFighterDrafts({ ...fighterDrafts, [participant.id]: "" })
                              )
                            }
                          >
                            Include fighter
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {participants.length === 0 ? (
                  <p className="muted">Add participating warbands before recording results.</p>
                ) : null}
              </div>

              {selectedBattle.battle_events && selectedBattle.battle_events.length > 0 ? (
                <details className="collapsible-section">
                  <summary>Battle events</summary>
                  <div className="progression-block">
                  <div className="progression-list">
                    {selectedBattle.battle_events.slice(0, 5).map((event) => (
                      <div className="progression-row" key={event.id}>
                        <span>
                          <strong>{event.summary}</strong>
                          <small>{event.event_type}</small>
                        </span>
                        <small>{new Date(event.created_at).toLocaleString()}</small>
                      </div>
                    ))}
                  </div>
                  </div>
                </details>
              ) : null}

              <div className="hero-actions">
                <button
                  className="button"
                  type="button"
                  disabled={saving || !canChangeBattle || participants.length === 0}
                  onClick={() =>
                    void onRecordResults(selectedBattle.id, Object.values(resultDrafts))
                  }
                >
                  Record results
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={saving || selectedBattle.status === "completed"}
                  onClick={() => void onCompleteBattle(selectedBattle)}
                >
                  Complete battle
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
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
  client,
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
  onWarbandStatusChange,
  onMessage,
  onError
}: {
  client: ReturnType<typeof getSupabaseClient>;
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
  onMessage: (message: string | null) => void;
  onError: (message: string | null) => void;
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

        <details className="collapsible-section" open>
          <summary>Roster fighters</summary>
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
        </details>

        <WarbandProgressionPanel
          client={client}
          warband={selectedWarband}
          canManage={canManage}
          onMessage={onMessage}
          onError={onError}
        />
      </div>
    </div>
  );
}

function WarbandProgressionPanel({
  client,
  warband,
  canManage,
  onMessage,
  onError
}: {
  client: ReturnType<typeof getSupabaseClient>;
  warband: Warband;
  canManage: boolean;
  onMessage: (message: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [definitions, setDefinitions] = useState<ProgressionDefinitions | null>(null);
  const [state, setState] = useState<WarbandProgressionState>(emptyProgressionState);
  const [loading, setLoading] = useState(true);
  const [progressionDraft, setProgressionDraft] = useState<ProgressionDraft>(
    createProgressionDraft(null)
  );
  const [encampmentDefinitionId, setEncampmentDefinitionId] = useState("");
  const [questDefinitionId, setQuestDefinitionId] = useState("");
  const [questProgressDrafts, setQuestProgressDrafts] = useState<Record<string, string>>({});
  const [artefactDefinitionId, setArtefactDefinitionId] = useState("");
  const [artefactNotes, setArtefactNotes] = useState("");
  const [artefactNoteDrafts, setArtefactNoteDrafts] = useState<Record<string, string>>({});
  const [renownDrafts, setRenownDrafts] = useState<Record<string, string>>({});
  const [traitDrafts, setTraitDrafts] = useState<Record<string, string>>({});
  const [injuryDrafts, setInjuryDrafts] = useState<
    Record<string, { name: string; description: string }>
  >({});

  const loadProgression = useCallback(async () => {
    if (!client) {
      return;
    }

    setLoading(true);

    try {
      const [nextDefinitions, nextState] = await Promise.all([
        listProgressionDefinitions(client),
        getWarbandProgressionState(client, warband)
      ]);

      setDefinitions(nextDefinitions);
      setState(nextState);
    } catch (loadError) {
      onError(getErrorMessage(loadError, "Progression could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [client, onError, warband]);

  useEffect(() => {
    void loadProgression();
  }, [loadProgression]);

  useEffect(() => {
    setProgressionDraft(createProgressionDraft(state.progress));
    setEncampmentDefinitionId(state.encampment?.encampment_definition_id ?? "");
    setQuestProgressDrafts(
      Object.fromEntries(state.quests.map((quest) => [quest.id, String(quest.progress)]))
    );
    setArtefactNoteDrafts(
      Object.fromEntries(state.artefacts.map((artefact) => [artefact.id, artefact.notes]))
    );
    setRenownDrafts(
      Object.fromEntries(
        (warband.warband_fighters ?? []).map((fighter) => [
          fighter.id,
          String(state.renown.find((row) => row.warband_fighter_id === fighter.id)?.renown ?? 0)
        ])
      )
    );
  }, [state, warband.warband_fighters]);

  const availableDefinitions = definitions
    ? filterProgressionDefinitionsForWarband(definitions, warband)
    : null;
  const rosterFighters = [...(warband.warband_fighters ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
  );
  const activeQuests = state.quests.filter((quest) => !quest.completed_at);
  const completedQuests = state.quests.filter((quest) => quest.completed_at);

  async function runProgressionAction(action: () => Promise<unknown>, success: string) {
    if (!client) {
      return;
    }

    onError(null);
    onMessage(null);

    try {
      await action();
      await loadProgression();
      onMessage(success);
    } catch (progressionError) {
      onError(getErrorMessage(progressionError, "Progression could not be saved."));
    }
  }

  function getArtefactDefinition(): ArtefactDefinition | null {
    return (
      availableDefinitions?.artefacts.find((artefact) => artefact.id === artefactDefinitionId) ??
      null
    );
  }

  function getTraitDefinitionOptions(fighterId: string): HeroicTraitDefinition[] {
    const assignedTraitIds = new Set(
      state.heroicTraits
        .filter((trait) => trait.warband_fighter_id === fighterId)
        .map((trait) => trait.heroic_trait_definition_id)
    );

    return (availableDefinitions?.heroicTraits ?? []).filter(
      (trait) => !assignedTraitIds.has(trait.id)
    );
  }

  if (loading) {
    return (
      <section className="progression-section">
        <p className="eyebrow">Progression</p>
        <p className="muted">Loading progression.</p>
      </section>
    );
  }

  return (
    <section className="progression-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Progression</p>
          <h3>Campaign state</h3>
        </div>
      </div>

      <form
        className="progression-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void runProgressionAction(
            () => saveWarbandProgress(client!, warband.id, progressionDraft),
            "Warband progression saved."
          );
        }}
      >
        <label>
          Glory
          <input
            inputMode="numeric"
            value={progressionDraft.glory}
            disabled={!canManage}
            onChange={(event) =>
              setProgressionDraft({ ...progressionDraft, glory: event.target.value })
            }
          />
        </label>
        <label>
          Reputation
          <input
            inputMode="numeric"
            value={progressionDraft.reputation}
            disabled={!canManage}
            onChange={(event) =>
              setProgressionDraft({ ...progressionDraft, reputation: event.target.value })
            }
          />
        </label>
        <label className="progression-wide">
          Notes
          <textarea
            rows={3}
            value={progressionDraft.notes}
            disabled={!canManage}
            maxLength={2000}
            onChange={(event) =>
              setProgressionDraft({ ...progressionDraft, notes: event.target.value })
            }
          />
        </label>
        {canManage ? (
          <button className="button" type="submit">
            Save progression
          </button>
        ) : null}
      </form>

      <div className="progression-grid">
        <label>
          Encampment
          <select
            value={encampmentDefinitionId}
            disabled={!canManage}
            onChange={(event) => setEncampmentDefinitionId(event.target.value)}
          >
            <option value="">No encampment</option>
            {(availableDefinitions?.encampments ?? []).map((encampment) => (
              <option key={encampment.id} value={encampment.id}>
                {encampment.name}
              </option>
            ))}
          </select>
        </label>
        {canManage ? (
          <button
            className="button"
            type="button"
            onClick={() =>
              void runProgressionAction(
                () => setWarbandEncampment(client!, warband.id, encampmentDefinitionId),
                encampmentDefinitionId ? "Encampment saved." : "Encampment cleared."
              )
            }
          >
            Save encampment
          </button>
        ) : null}
      </div>

      <details className="collapsible-section">
        <summary>Quests</summary>
        <div className="progression-block">
        {canManage ? (
          <div className="inline-form">
            <label>
              Start quest
              <select
                value={questDefinitionId}
                onChange={(event) => setQuestDefinitionId(event.target.value)}
              >
                <option value="">Choose quest</option>
                {(availableDefinitions?.quests ?? []).map((quest) => (
                  <option key={quest.id} value={quest.id}>
                    {quest.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button"
              type="button"
              onClick={() =>
                void runProgressionAction(async () => {
                  await startWarbandQuest(client!, warband.id, questDefinitionId);
                  setQuestDefinitionId("");
                }, "Quest started.")
              }
            >
              Start quest
            </button>
          </div>
        ) : null}

        <div className="progression-list">
          {[...activeQuests, ...completedQuests].map((quest) => (
            <QuestProgressRow
              key={quest.id}
              quest={quest}
              progressDraft={questProgressDrafts[quest.id] ?? String(quest.progress)}
              canManage={canManage}
              onProgressChange={(value) =>
                setQuestProgressDrafts({ ...questProgressDrafts, [quest.id]: value })
              }
              onSave={() =>
                runProgressionAction(
                  () => updateWarbandQuestProgress(client!, quest.id, questProgressDrafts[quest.id] ?? "0"),
                  "Quest progress saved."
                )
              }
              onComplete={() =>
                runProgressionAction(() => completeWarbandQuest(client!, quest.id), "Quest completed.")
              }
              onAbandon={() =>
                runProgressionAction(() => abandonWarbandQuest(client!, quest.id), "Quest removed.")
              }
            />
          ))}
          {state.quests.length === 0 ? <p className="muted">No quests started.</p> : null}
        </div>
        </div>
      </details>

      <details className="collapsible-section">
        <summary>Artefacts</summary>
        <div className="progression-block">
        {canManage ? (
          <div className="inline-form">
            <label>
              Add artefact
              <select
                value={artefactDefinitionId}
                onChange={(event) => setArtefactDefinitionId(event.target.value)}
              >
                <option value="">Choose artefact</option>
                {(availableDefinitions?.artefacts ?? []).map((artefact) => (
                  <option key={artefact.id} value={artefact.id}>
                    {artefact.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <input
                value={artefactNotes}
                onChange={(event) => setArtefactNotes(event.target.value)}
                maxLength={2000}
              />
            </label>
            <button
              className="button"
              type="button"
              onClick={() =>
                void runProgressionAction(async () => {
                  await addWarbandArtefact(client!, warband.id, getArtefactDefinition(), artefactNotes);
                  setArtefactDefinitionId("");
                  setArtefactNotes("");
                }, "Artefact added.")
              }
            >
              Add artefact
            </button>
          </div>
        ) : null}

        <div className="progression-list">
          {state.artefacts.map((artefact) => (
            <ArtefactProgressRow
              key={artefact.id}
              artefact={artefact}
              fighters={rosterFighters}
              noteDraft={artefactNoteDrafts[artefact.id] ?? artefact.notes}
              canManage={canManage}
              onNoteChange={(value) =>
                setArtefactNoteDrafts({ ...artefactNoteDrafts, [artefact.id]: value })
              }
              onAssign={(fighterId) =>
                runProgressionAction(
                  () => assignFighterArtefact(client!, artefact.id, fighterId),
                  fighterId ? "Artefact assigned." : "Artefact unassigned."
                )
              }
              onSaveNotes={() =>
                runProgressionAction(
                  () => updateWarbandArtefactNotes(client!, artefact.id, artefactNoteDrafts[artefact.id] ?? ""),
                  "Artefact notes saved."
                )
              }
              onRemove={() =>
                runProgressionAction(
                  () => removeWarbandArtefact(client!, artefact.id),
                  "Artefact removed."
                )
              }
            />
          ))}
          {state.artefacts.length === 0 ? <p className="muted">No artefacts recorded.</p> : null}
        </div>
        </div>
      </details>

      <details className="collapsible-section">
        <summary>Fighter progression</summary>
        <div className="progression-block">
        <div className="progression-list">
          {rosterFighters.map((fighter) => {
            const assignedTraits = state.heroicTraits.filter(
              (trait) => trait.warband_fighter_id === fighter.id
            );
            const fighterInjuries = state.injuries.filter(
              (injury) => injury.warband_fighter_id === fighter.id
            );
            const injuryDraft = injuryDrafts[fighter.id] ?? { name: "", description: "" };

            return (
              <div className="progression-row progression-row--stacked" key={fighter.id}>
                <div>
                  <strong>{fighter.name}</strong>
                  <small>{fighterStatusLabels[fighter.status]}</small>
                </div>

                <div className="progression-grid">
                  <label>
                    Renown
                    <input
                      inputMode="numeric"
                      value={renownDrafts[fighter.id] ?? "0"}
                      disabled={!canManage}
                      onChange={(event) =>
                        setRenownDrafts({ ...renownDrafts, [fighter.id]: event.target.value })
                      }
                    />
                  </label>
                  {canManage ? (
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() =>
                        void runProgressionAction(
                          () => saveFighterRenown(client!, fighter.id, renownDrafts[fighter.id] ?? "0"),
                          "Renown saved."
                        )
                      }
                    >
                      Save renown
                    </button>
                  ) : null}
                </div>

                <div className="tag-list">
                  {assignedTraits.map((trait) => (
                    <span key={trait.id}>
                      {getDefinitionName(trait.heroic_trait_definitions)}
                      {canManage ? (
                        <button
                          className="tag-remove"
                          type="button"
                          onClick={() =>
                            void runProgressionAction(
                              () => removeFighterHeroicTrait(client!, trait.id),
                              "Heroic trait removed."
                            )
                          }
                        >
                          Remove
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>

                {canManage ? (
                  <div className="inline-form">
                    <label>
                      Heroic trait
                      <select
                        value={traitDrafts[fighter.id] ?? ""}
                        onChange={(event) =>
                          setTraitDrafts({ ...traitDrafts, [fighter.id]: event.target.value })
                        }
                      >
                        <option value="">Choose trait</option>
                        {getTraitDefinitionOptions(fighter.id).map((trait) => (
                          <option key={trait.id} value={trait.id}>
                            {trait.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() =>
                        void runProgressionAction(async () => {
                          await addFighterHeroicTrait(client!, fighter.id, traitDrafts[fighter.id] ?? "");
                          setTraitDrafts({ ...traitDrafts, [fighter.id]: "" });
                        }, "Heroic trait added.")
                      }
                    >
                      Add trait
                    </button>
                  </div>
                ) : null}

                <div className="progression-list">
                  {fighterInjuries.map((injury) => (
                    <InjuryRow
                      key={injury.id}
                      injury={injury}
                      canManage={canManage}
                      onRecover={() =>
                        runProgressionAction(
                          () => recoverFighterInjury(client!, injury.id),
                          "Injury marked recovered."
                        )
                      }
                    />
                  ))}
                </div>

                {canManage ? (
                  <div className="inline-form">
                    <label>
                      Injury
                      <input
                        value={injuryDraft.name}
                        onChange={(event) =>
                          setInjuryDrafts({
                            ...injuryDrafts,
                            [fighter.id]: { ...injuryDraft, name: event.target.value }
                          })
                        }
                        maxLength={120}
                      />
                    </label>
                    <label>
                      Description
                      <input
                        value={injuryDraft.description}
                        onChange={(event) =>
                          setInjuryDrafts({
                            ...injuryDrafts,
                            [fighter.id]: { ...injuryDraft, description: event.target.value }
                          })
                        }
                        maxLength={1000}
                      />
                    </label>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() =>
                        void runProgressionAction(async () => {
                          await addFighterInjury(
                            client!,
                            fighter.id,
                            injuryDraft.name,
                            injuryDraft.description
                          );
                          setInjuryDrafts({
                            ...injuryDrafts,
                            [fighter.id]: { name: "", description: "" }
                          });
                        }, "Injury added.")
                      }
                    >
                      Add injury
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {rosterFighters.length === 0 ? <p className="muted">Add fighters before tracking renown.</p> : null}
        </div>
        </div>
      </details>

      <details className="collapsible-section">
        <summary>Progression journal</summary>
        <div className="progression-block">
        <div className="progression-list">
          {state.journal.map((entry) => (
            <div className="progression-row" key={entry.id}>
              <span>
                <strong>{entry.summary}</strong>
                <small>{entry.event_type}</small>
              </span>
              <small>{new Date(entry.created_at).toLocaleString()}</small>
            </div>
          ))}
          {state.journal.length === 0 ? <p className="muted">No progression journal entries yet.</p> : null}
        </div>
        </div>
      </details>
    </section>
  );
}

function QuestProgressRow({
  quest,
  progressDraft,
  canManage,
  onProgressChange,
  onSave,
  onComplete,
  onAbandon
}: {
  quest: WarbandQuest;
  progressDraft: string;
  canManage: boolean;
  onProgressChange: (value: string) => void;
  onSave: () => Promise<unknown>;
  onComplete: () => Promise<unknown>;
  onAbandon: () => Promise<unknown>;
}) {
  return (
    <div className="progression-row">
      <span>
        <strong>{getDefinitionName(quest.quest_definitions, "Unknown quest")}</strong>
        <small>{quest.completed_at ? "Completed" : "Active"}</small>
      </span>
      <label>
        Progress
        <input
          inputMode="numeric"
          value={progressDraft}
          disabled={!canManage || Boolean(quest.completed_at)}
          onChange={(event) => onProgressChange(event.target.value)}
        />
      </label>
      {canManage ? (
        <div className="progression-actions">
          <button className="button button--secondary" type="button" onClick={() => void onSave()}>
            Save
          </button>
          {!quest.completed_at ? (
            <button className="button button--secondary" type="button" onClick={() => void onComplete()}>
              Complete
            </button>
          ) : null}
          <button className="link-button" type="button" onClick={() => void onAbandon()}>
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ArtefactProgressRow({
  artefact,
  fighters,
  noteDraft,
  canManage,
  onNoteChange,
  onAssign,
  onSaveNotes,
  onRemove
}: {
  artefact: WarbandArtefact;
  fighters: WarbandFighter[];
  noteDraft: string;
  canManage: boolean;
  onNoteChange: (value: string) => void;
  onAssign: (fighterId: string) => Promise<unknown>;
  onSaveNotes: () => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const assignedFighterId = artefact.fighter_artefacts?.[0]?.warband_fighter_id ?? "";

  return (
    <div className="progression-row">
      <span>
        <strong>{artefact.name || getDefinitionName(artefact.artefact_definitions, "Unknown artefact")}</strong>
        <small>{getDefinitionName(artefact.artefact_definitions, "Definition unavailable")}</small>
      </span>
      <label>
        Assigned
        <select
          value={assignedFighterId}
          disabled={!canManage}
          onChange={(event) => void onAssign(event.target.value)}
        >
          <option value="">Warband stash</option>
          {fighters.map((fighter) => (
            <option key={fighter.id} value={fighter.id}>
              {fighter.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <input
          value={noteDraft}
          disabled={!canManage}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </label>
      {canManage ? (
        <div className="progression-actions">
          <button className="button button--secondary" type="button" onClick={() => void onSaveNotes()}>
            Save
          </button>
          <button className="link-button" type="button" onClick={() => void onRemove()}>
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

function InjuryRow({
  injury,
  canManage,
  onRecover
}: {
  injury: FighterInjury;
  canManage: boolean;
  onRecover: () => Promise<unknown>;
}) {
  return (
    <div className="progression-row">
      <span>
        <strong>{injury.name}</strong>
        <small>{injury.description || "No description"}</small>
      </span>
      <span className="status-pill">{injury.recovered_at ? "Recovered" : "Active"}</span>
      {canManage && !injury.recovered_at ? (
        <button className="button button--secondary" type="button" onClick={() => void onRecover()}>
          Recover
        </button>
      ) : null}
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
  const profile = getFighterProfile(fighter);
  const fighterPoints = getWarbandFighterPoints(fighter);
  const [name, setName] = useState(fighter.name);

  useEffect(() => {
    setName(fighter.name);
  }, [fighter.name]);

  return (
    <article className="fighter-card">
      <div>
        <h4>{fighter.name}</h4>
        <p className="muted">
          {snapshot?.name ?? profile?.name ?? "Unknown profile"} - {fighterPoints} pts
        </p>
      </div>

      {snapshot || profile ? (
        <dl className="mini-stat-grid">
          <div>
            <dt>Move</dt>
            <dd>{snapshot?.movement ?? profile?.movement}</dd>
          </div>
          <div>
            <dt>Tough</dt>
            <dd>{snapshot?.toughness ?? profile?.toughness}</dd>
          </div>
          <div>
            <dt>Wounds</dt>
            <dd>{snapshot?.wounds ?? profile?.wounds}</dd>
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
              disabled={saving || !(snapshot?.is_leader ?? profile?.is_leader)}
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
