import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateTimeLocalValue } from "./campaigns";
import type { AftermathSession } from "./aftermath";
import type { Warband, WarbandFighter } from "./warbands";

export type BattleStatus =
  | "draft"
  | "scheduled"
  | "ready"
  | "played"
  | "aftermath_pending"
  | "completed"
  | "cancelled";

export type BattleParticipantResult = "winner" | "draw" | "loss" | "unknown";

export type BattleFighterOutcome = "unharmed" | "taken_down" | "injured" | "killed" | "missing";

export type BattleDraft = {
  battleplanName: string;
  locationName: string;
  scheduledAt: string;
  notes: string;
};

export type BattleResultDraft = {
  participantId: string;
  result: BattleParticipantResult;
  score: string;
  notes: string;
};

export type BattleFighter = {
  id: string;
  battle_id: string;
  battle_participant_id: string;
  warband_fighter_id: string;
  fighter_profile_snapshot_id: string;
  name: string;
  status_at_battle: WarbandFighter["status"];
  is_leader: boolean;
  points: number;
  outcome: BattleFighterOutcome;
  casualty_notes: string;
  created_at: string;
  updated_at: string;
};

export type BattleParticipant = {
  id: string;
  battle_id: string;
  warband_id: string;
  result: BattleParticipantResult;
  score: number;
  notes: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  warbands?: Pick<Warband, "id" | "name" | "status" | "warband_fighters"> | null;
  battle_fighters?: BattleFighter[];
};

export type BattleEvent = {
  id: string;
  battle_id: string;
  event_type: string;
  summary: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type Battle = {
  id: string;
  campaign_id: string;
  status: BattleStatus;
  battleplan_name: string;
  location_name: string;
  scheduled_at: string | null;
  played_at: string | null;
  notes: string;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  battle_participants?: BattleParticipant[];
  battle_events?: BattleEvent[];
  aftermath_sessions?: AftermathSession[];
};

export const battleStatusLabels: Record<BattleStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  ready: "Ready",
  played: "Played",
  aftermath_pending: "Aftermath pending",
  completed: "Completed",
  cancelled: "Cancelled"
};

export const battleResultLabels: Record<BattleParticipantResult, string> = {
  winner: "Winner",
  draw: "Draw",
  loss: "Loss",
  unknown: "Unknown"
};

export function createBattleDraft(now = new Date()): BattleDraft {
  const scheduledAt = new Date(now);
  scheduledAt.setMinutes(Math.ceil(scheduledAt.getMinutes() / 15) * 15, 0, 0);

  return {
    battleplanName: "",
    locationName: "",
    scheduledAt: toDateTimeLocalValue(scheduledAt),
    notes: ""
  };
}

export function validateBattleDraft(draft: BattleDraft) {
  const normalized = {
    battleplanName: draft.battleplanName.trim(),
    locationName: draft.locationName.trim(),
    scheduledAt: draft.scheduledAt.trim(),
    notes: draft.notes.trim()
  };
  const errors: string[] = [];

  if (normalized.battleplanName.length > 120) {
    errors.push("Battleplan name must be 120 characters or fewer.");
  }

  if (normalized.locationName.length > 120) {
    errors.push("Location name must be 120 characters or fewer.");
  }

  if (normalized.scheduledAt && Number.isNaN(Date.parse(normalized.scheduledAt))) {
    errors.push("Scheduled time must be a valid date and time.");
  }

  if (normalized.notes.length > 2000) {
    errors.push("Battle notes must be 2000 characters or fewer.");
  }

  return { normalized, errors };
}

export function normalizeBattleResultDrafts(drafts: BattleResultDraft[]) {
  const normalized = drafts.map((draft) => ({
    participantId: draft.participantId,
    result: draft.result,
    score: draft.score.trim() ? Number(draft.score.trim()) : 0,
    notes: draft.notes.trim()
  }));
  const errors: string[] = [];

  if (normalized.length === 0) {
    errors.push("A battle must have participants before results can be recorded.");
  }

  for (const draft of normalized) {
    if (!Number.isInteger(draft.score) || draft.score < 0) {
      errors.push("Participant scores must be whole numbers of 0 or more.");
      break;
    }

    if (draft.notes.length > 1000) {
      errors.push("Participant result notes must be 1000 characters or fewer.");
      break;
    }
  }

  return { normalized, errors };
}

export function validateBattleCompletion(battle: Pick<Battle, "battle_participants">) {
  const participants = battle.battle_participants ?? [];
  const errors: string[] = [];

  if (participants.length === 0) {
    errors.push("Add at least one participating warband before completing the battle.");
  }

  if (participants.some((participant) => participant.result === "unknown")) {
    errors.push("Record a result for every participating warband before completing the battle.");
  }

  return { valid: errors.length === 0, errors };
}

export function getBattleParticipantPoints(participant: Pick<BattleParticipant, "battle_fighters">) {
  return (participant.battle_fighters ?? []).reduce((sum, fighter) => sum + fighter.points, 0);
}

export function getBattleParticipantName(participant: BattleParticipant) {
  return participant.warbands?.name ?? `Warband ${participant.warband_id.slice(0, 8)}`;
}

export function getEligibleBattleFighters(
  participant: BattleParticipant,
  warband: Pick<Warband, "warband_fighters"> | null | undefined,
  includeUnavailable: boolean
) {
  const selectedIds = new Set(
    (participant.battle_fighters ?? []).map((fighter) => fighter.warband_fighter_id)
  );

  return (warband?.warband_fighters ?? []).filter(
    (fighter) =>
      !selectedIds.has(fighter.id) &&
      (fighter.status === "active" || includeUnavailable)
  );
}

export async function listBattles(client: SupabaseClient, campaignId: string) {
  const { data, error } = await client
    .from("battles")
    .select(
      `
      *,
      battle_participants(
        *,
        warbands(id, name, status, warband_fighters(*)),
        battle_fighters(*)
      ),
      aftermath_sessions(
        *,
        aftermath_steps(*)
      ),
      battle_events(*)
    `
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "battle_events", ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Battle[];
}

export async function createBattle(
  client: SupabaseClient,
  campaignId: string,
  draft: BattleDraft
) {
  const { normalized, errors } = validateBattleDraft(draft);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  const { data, error } = await client.rpc("create_battle", {
    target_campaign_id: campaignId,
    battleplan: normalized.battleplanName,
    location: normalized.locationName,
    scheduled_for: normalized.scheduledAt ? new Date(normalized.scheduledAt).toISOString() : null,
    battle_notes: normalized.notes
  });

  if (error) {
    throw error;
  }

  return data as Battle;
}

export async function updateBattle(
  client: SupabaseClient,
  battleId: string,
  fields: Partial<Pick<Battle, "status" | "battleplan_name" | "location_name" | "scheduled_at" | "played_at" | "notes">>
) {
  const { error } = await client.from("battles").update(fields).eq("id", battleId);

  if (error) {
    throw error;
  }
}

export async function addBattleParticipant(
  client: SupabaseClient,
  battleId: string,
  warbandId: string
) {
  if (!warbandId) {
    throw new Error("Choose a warband to add to the battle.");
  }

  const { data, error } = await client.rpc("add_battle_participant", {
    target_battle_id: battleId,
    target_warband_id: warbandId
  });

  if (error) {
    throw error;
  }

  return data as BattleParticipant;
}

export async function removeBattleParticipant(client: SupabaseClient, participantId: string) {
  const { error } = await client.rpc("remove_battle_participant", {
    target_participant_id: participantId
  });

  if (error) {
    throw error;
  }
}

export async function addBattleFighter(
  client: SupabaseClient,
  participantId: string,
  fighterId: string,
  allowUnavailable: boolean
) {
  if (!fighterId) {
    throw new Error("Choose a fighter to include.");
  }

  const { error } = await client.rpc("snapshot_battle_fighter", {
    target_participant_id: participantId,
    target_warband_fighter_id: fighterId,
    allow_unavailable: allowUnavailable
  });

  if (error) {
    throw error;
  }
}

export async function removeBattleFighter(client: SupabaseClient, battleFighterId: string) {
  const { error } = await client.from("battle_fighters").delete().eq("id", battleFighterId);

  if (error) {
    throw error;
  }
}

export async function recordBattleResults(
  client: SupabaseClient,
  battleId: string,
  drafts: BattleResultDraft[]
) {
  const { normalized, errors } = normalizeBattleResultDrafts(drafts);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  const { error } = await client.rpc("record_battle_results", {
    target_battle_id: battleId,
    participant_results: normalized
  });

  if (error) {
    throw error;
  }
}

export async function completeBattle(client: SupabaseClient, battle: Battle) {
  const validation = validateBattleCompletion(battle);

  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const { error } = await client.rpc("complete_battle", {
    target_battle_id: battle.id
  });

  if (error) {
    throw error;
  }
}
