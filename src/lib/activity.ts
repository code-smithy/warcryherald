import type { SupabaseClient } from "@supabase/supabase-js";
import type { AftermathSession } from "./aftermath";
import type { Battle, BattleParticipantResult } from "./battles";
import type { CampaignMemberProfile } from "./campaigns";
import type {
  FighterInjury,
  FighterRenown,
  WarbandArtefact,
  WarbandEncampment,
  WarbandProgress,
  WarbandQuest
} from "./progression";
import {
  getWarbandFighterPoints,
  type Warband,
  type WarbandFighterStatus
} from "./warbands";

export type CampaignActivityLogEntry = {
  id: string;
  campaign_id: string;
  warband_id: string | null;
  battle_id: string | null;
  actor_id: string | null;
  event_type: string;
  summary: string;
  details: Record<string, unknown>;
  source_table: string | null;
  source_id: string | null;
  created_at: string;
  profiles?: CampaignMemberProfile | CampaignMemberProfile[] | null;
};

export type CampaignProgressionSnapshot = {
  progress: WarbandProgress[];
  encampments: WarbandEncampment[];
  quests: WarbandQuest[];
  artefacts: WarbandArtefact[];
  renown: FighterRenown[];
  injuries: FighterInjury[];
};

export type WarbandBattleRecord = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
};

export type WarbandFighterStatusCounts = Record<WarbandFighterStatus, number>;

export const emptyCampaignProgressionSnapshot: CampaignProgressionSnapshot = {
  progress: [],
  encampments: [],
  quests: [],
  artefacts: [],
  renown: [],
  injuries: []
};

export const activityEventLabels: Record<string, string> = {
  warband_created: "Warband created",
  fighter_recruited: "Fighter recruited",
  fighter_injured: "Fighter injured",
  fighter_killed: "Fighter killed",
  fighter_missing: "Fighter missing",
  fighter_retired: "Fighter retired",
  fighter_recovered: "Fighter recovered",
  quest_started: "Quest started",
  quest_completed: "Quest completed",
  battle_created: "Battle created",
  battle_completed: "Battle completed",
  battle_results_recorded: "Battle results recorded",
  aftermath_completed: "Aftermath completed",
  aftermath_step_completed: "Aftermath step completed",
  artefact_acquired: "Artefact acquired",
  encampment_changed: "Encampment changed",
  member_joined: "Member joined"
};

export function getActivityEventLabel(eventType: string) {
  return activityEventLabels[eventType] ?? titleizeEventType(eventType);
}

export function getWarbandFighterStatusCounts(warband: Pick<Warband, "warband_fighters">) {
  const counts: WarbandFighterStatusCounts = {
    active: 0,
    recovering: 0,
    missing: 0,
    dead: 0,
    retired: 0
  };

  for (const fighter of warband.warband_fighters ?? []) {
    counts[fighter.status] += 1;
  }

  return counts;
}

export function getWarbandBattleRecord(battles: Battle[], warbandId: string): WarbandBattleRecord {
  const record: WarbandBattleRecord = { played: 0, wins: 0, draws: 0, losses: 0 };

  for (const battle of battles) {
    if (battle.status !== "completed" && battle.status !== "aftermath_pending") {
      continue;
    }

    const participant = (battle.battle_participants ?? []).find(
      (candidate) => candidate.warband_id === warbandId
    );

    if (!participant || participant.result === "unknown") {
      continue;
    }

    record.played += 1;
    incrementResult(record, participant.result);
  }

  return record;
}

export function getPendingAftermathSessions(battles: Battle[]): AftermathSession[] {
  return battles.flatMap((battle) =>
    (battle.aftermath_sessions ?? []).filter((session) => session.status !== "completed")
  );
}

export function getCampaignProgressTotals(snapshot: Pick<CampaignProgressionSnapshot, "progress">) {
  return snapshot.progress.reduce(
    (totals, progress) => ({
      glory: totals.glory + progress.glory,
      reputation: totals.reputation + progress.reputation
    }),
    { glory: 0, reputation: 0 }
  );
}

export function getWarbandProgress(
  snapshot: Pick<CampaignProgressionSnapshot, "progress">,
  warbandId: string
) {
  return snapshot.progress.find((progress) => progress.warband_id === warbandId) ?? null;
}

export function getWarbandCurrentPoints(warband: Pick<Warband, "warband_fighters">) {
  return (warband.warband_fighters ?? [])
    .filter((fighter) => fighter.status === "active")
    .reduce((sum, fighter) => sum + getWarbandFighterPoints(fighter), 0);
}

export async function listCampaignActivityLog(
  client: SupabaseClient,
  campaignId: string,
  limit = 50
) {
  const { data, error } = await client
    .from("activity_log")
    .select("*, profiles(display_name, avatar_url, discord_user_id)")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as CampaignActivityLogEntry[];
}

export async function listCampaignProgressionSnapshot(
  client: SupabaseClient,
  warbands: Warband[]
): Promise<CampaignProgressionSnapshot> {
  const warbandIds = warbands.map((warband) => warband.id);
  const fighterIds = warbands.flatMap((warband) =>
    (warband.warband_fighters ?? []).map((fighter) => fighter.id)
  );

  const [
    progress,
    encampments,
    quests,
    artefacts,
    renown,
    injuries
  ] = await Promise.all([
    selectWarbandRows<WarbandProgress>(client, "warband_progress", "*", warbandIds),
    selectWarbandRows<WarbandEncampment>(
      client,
      "warband_encampments",
      "*, encampment_definitions(*)",
      warbandIds
    ),
    selectWarbandRows<WarbandQuest>(
      client,
      "warband_quests",
      "*, quest_definitions(*)",
      warbandIds
    ),
    selectWarbandRows<WarbandArtefact>(
      client,
      "warband_artefacts",
      "*, artefact_definitions(*), fighter_artefacts(*)",
      warbandIds
    ),
    selectFighterRows<FighterRenown>(client, "fighter_renown", "*", fighterIds),
    selectFighterRows<FighterInjury>(client, "fighter_injuries", "*", fighterIds)
  ]);

  return {
    progress,
    encampments,
    quests,
    artefacts,
    renown,
    injuries
  };
}

async function selectWarbandRows<T>(
  client: SupabaseClient,
  table: string,
  select: string,
  warbandIds: string[]
) {
  if (warbandIds.length === 0) {
    return [] as T[];
  }

  const { data, error } = await client
    .from(table)
    .select(select)
    .in("warband_id", warbandIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as T[];
}

async function selectFighterRows<T>(
  client: SupabaseClient,
  table: string,
  select: string,
  fighterIds: string[]
) {
  if (fighterIds.length === 0) {
    return [] as T[];
  }

  const { data, error } = await client
    .from(table)
    .select(select)
    .in("warband_fighter_id", fighterIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as T[];
}

function incrementResult(record: WarbandBattleRecord, result: BattleParticipantResult) {
  if (result === "winner") {
    record.wins += 1;
  } else if (result === "draw") {
    record.draws += 1;
  } else if (result === "loss") {
    record.losses += 1;
  }
}

function titleizeEventType(eventType: string) {
  return eventType
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
