import type { SupabaseClient } from "@supabase/supabase-js";
import type { GrandAlliance } from "./reference-data";

export type WarbandStatus = "draft" | "battle_ready" | "retired";
export type WarbandFighterStatus = "active" | "recovering" | "missing" | "dead" | "retired";

export type ValidationIssue = {
  code: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  totalPoints: number;
  fighterCount: number;
};

export type WarbandFaction = {
  id: string;
  stable_key: string;
  name: string;
  grand_alliance_id?: string;
  grand_alliances?: GrandAlliance | GrandAlliance[] | null;
};

export type WarbandRulesRelease = {
  id: string;
  stable_key: string;
  name: string;
  release_date: string;
  language: string;
  status: string;
};

export type FighterProfileSnapshot = {
  id: string;
  fighter_profile_id: string;
  rules_release_id: string;
  faction_id: string;
  stable_key: string;
  name: string;
  movement: number;
  toughness: number;
  wounds: number;
  points: number;
  base_size_mm: number | null;
  is_leader: boolean;
  weapons: unknown[];
  runemarks: unknown[];
  captured_at: string;
};

export type WarbandFighterProfile = Pick<
  FighterProfileSnapshot,
  "id" | "name" | "movement" | "toughness" | "wounds" | "points" | "is_leader"
>;

export type WarbandFighter = {
  id: string;
  warband_id: string;
  fighter_profile_snapshot_id: string;
  fighter_profile_id: string;
  name: string;
  status: WarbandFighterStatus;
  is_leader: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  fighter_profile_snapshots?: FighterProfileSnapshot | FighterProfileSnapshot[] | null;
  fighter_profiles?: WarbandFighterProfile | WarbandFighterProfile[] | null;
};

export type Warband = {
  id: string;
  campaign_id: string;
  owner_id: string;
  rules_release_id: string;
  faction_id: string;
  name: string;
  status: WarbandStatus;
  points_limit: number;
  fighter_minimum: number;
  fighter_limit: number;
  created_at: string;
  updated_at: string;
  factions?: WarbandFaction | WarbandFaction[] | null;
  rules_releases?: WarbandRulesRelease | WarbandRulesRelease[] | null;
  warband_fighters?: WarbandFighter[];
};

export type WarbandDraft = {
  campaignId: string;
  factionId: string;
  name: string;
};

export type WarbandFighterDraft = {
  warbandId: string;
  fighterProfileId: string;
  name: string;
  isLeader: boolean;
  points?: number;
};

export const warbandStatusLabels: Record<WarbandStatus, string> = {
  draft: "Draft",
  battle_ready: "Battle-ready",
  retired: "Retired"
};

export const fighterStatusLabels: Record<WarbandFighterStatus, string> = {
  active: "Active",
  recovering: "Recovering",
  missing: "Missing",
  dead: "Dead",
  retired: "Retired"
};

export function validateWarbandDraft(draft: Pick<WarbandDraft, "name" | "factionId">) {
  const normalized = {
    name: draft.name.trim(),
    factionId: draft.factionId
  };
  const errors: string[] = [];

  if (normalized.name.length < 2) {
    errors.push("Warband name must be at least 2 characters.");
  }

  if (normalized.name.length > 80) {
    errors.push("Warband name must be 80 characters or fewer.");
  }

  if (!normalized.factionId) {
    errors.push("Choose a faction for this warband.");
  }

  return { normalized, errors };
}

export function validateWarbandRoster(
  warband: Pick<Warband, "points_limit" | "fighter_minimum" | "fighter_limit" | "warband_fighters">
): ValidationResult {
  const activeFighters = getActiveRosterFighters(warband.warband_fighters ?? []);
  const totalPoints = activeFighters.reduce(
    (sum, fighter) => sum + getWarbandFighterPoints(fighter),
    0
  );
  const fighterCount = activeFighters.length;
  const leaderCount = activeFighters.filter((fighter) => fighter.is_leader).length;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const duplicateNames = findDuplicateActiveNames(activeFighters);

  if (fighterCount < warband.fighter_minimum) {
    errors.push({
      code: "missing-fighters",
      message: `Add at least ${warband.fighter_minimum} active fighters.`
    });
  }

  if (leaderCount < 1) {
    errors.push({
      code: "missing-leader",
      message: "Designate one active fighter as leader."
    });
  }

  if (leaderCount > 1) {
    errors.push({
      code: "multiple-leaders",
      message: "Only one active fighter can be the leader."
    });
  }

  if (totalPoints > warband.points_limit) {
    errors.push({
      code: "points-limit",
      message: `Roster is ${totalPoints - warband.points_limit} points over the limit.`
    });
  }

  if (fighterCount > warband.fighter_limit) {
    errors.push({
      code: "fighter-limit",
      message: `Roster has ${fighterCount - warband.fighter_limit} fighters over the limit.`
    });
  }

  for (const name of duplicateNames) {
    warnings.push({
      code: "duplicate-name",
      message: `Multiple active fighters are named ${name}.`
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalPoints,
    fighterCount
  };
}

export function validateWarbandFighterAddition(
  warband: Pick<Warband, "points_limit" | "fighter_limit" | "warband_fighters">,
  draft: Pick<WarbandFighterDraft, "points">
): ValidationIssue[] {
  const activeFighters = getActiveRosterFighters(warband.warband_fighters ?? []);
  const totalPoints = activeFighters.reduce(
    (sum, fighter) => sum + getWarbandFighterPoints(fighter),
    0
  );
  const nextPoints = totalPoints + (draft.points ?? 0);
  const errors: ValidationIssue[] = [];

  if (activeFighters.length + 1 > warband.fighter_limit) {
    errors.push({
      code: "fighter-limit",
      message: `Roster already has the maximum of ${warband.fighter_limit} active fighters.`
    });
  }

  if (nextPoints > warband.points_limit) {
    errors.push({
      code: "points-limit",
      message: `Adding this fighter would put the roster ${nextPoints - warband.points_limit} points over the limit.`
    });
  }

  return errors;
}

export function getActiveRosterFighters(fighters: WarbandFighter[]) {
  return fighters.filter((fighter) => fighter.status === "active");
}

export function getFighterSnapshot(fighter: WarbandFighter) {
  const snapshot = fighter.fighter_profile_snapshots;

  if (Array.isArray(snapshot)) {
    return snapshot[0] ?? null;
  }

  return snapshot ?? null;
}

export function getFighterProfile(fighter: WarbandFighter) {
  const profile = fighter.fighter_profiles;

  if (Array.isArray(profile)) {
    return profile[0] ?? null;
  }

  return profile ?? null;
}

export function getWarbandFighterPoints(fighter: WarbandFighter) {
  return getFighterSnapshot(fighter)?.points ?? getFighterProfile(fighter)?.points ?? 0;
}

export function getWarbandFaction(warband: Warband) {
  const faction = warband.factions;

  if (Array.isArray(faction)) {
    return faction[0] ?? null;
  }

  return faction ?? null;
}

export function normalizeFighterName(name: string, fallback: string) {
  const trimmed = name.trim();
  return trimmed || fallback;
}

export async function listWarbands(client: SupabaseClient, campaignId: string) {
  const { data, error } = await client
    .from("warbands")
    .select(
      `
      *,
      factions(id, stable_key, name, grand_alliance_id, grand_alliances(id, stable_key, name)),
      rules_releases(id, stable_key, name, release_date, language, status),
      warband_fighters(
        *,
        fighter_profile_snapshots:fighter_profile_snapshots!warband_fighters_fighter_profile_snapshot_id_fkey(*),
        fighter_profiles(id, name, movement, toughness, wounds, points, is_leader)
      )
    `
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Warband[];
}

export async function createWarband(client: SupabaseClient, draft: WarbandDraft) {
  const { normalized, errors } = validateWarbandDraft(draft);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  const { data, error } = await client.rpc("create_warband", {
    target_campaign_id: draft.campaignId,
    target_faction_id: normalized.factionId,
    warband_name: normalized.name
  });

  if (error) {
    throw error;
  }

  return data as Warband;
}

export async function updateWarband(
  client: SupabaseClient,
  warbandId: string,
  fields: Partial<Pick<Warband, "name" | "status" | "points_limit" | "fighter_minimum" | "fighter_limit">>
) {
  const { data, error } = await client
    .from("warbands")
    .update(fields)
    .eq("id", warbandId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Warband;
}

export async function addWarbandFighter(
  client: SupabaseClient,
  draft: WarbandFighterDraft,
  warband?: Pick<Warband, "points_limit" | "fighter_limit" | "warband_fighters">
) {
  if (!draft.fighterProfileId) {
    throw new Error("Choose a fighter profile to add.");
  }

  if (warband) {
    const errors = validateWarbandFighterAddition(warband, draft);

    if (errors.length > 0) {
      throw new Error(errors.map((issue) => issue.message).join(" "));
    }
  }

  const { data, error } = await client.rpc("add_warband_fighter", {
    target_warband_id: draft.warbandId,
    target_fighter_profile_id: draft.fighterProfileId,
    fighter_name: draft.name,
    designate_leader: draft.isLeader
  });

  if (error) {
    throw error;
  }

  return data as WarbandFighter;
}

export async function updateWarbandFighter(
  client: SupabaseClient,
  fighterId: string,
  fields: Partial<Pick<WarbandFighter, "name" | "status" | "is_leader" | "sort_order">>
) {
  const { error } = await client
    .from("warband_fighters")
    .update(fields)
    .eq("id", fighterId);

  if (error) {
    throw error;
  }
}

export async function removeWarbandFighter(client: SupabaseClient, fighterId: string) {
  const { error } = await client
    .from("warband_fighters")
    .delete()
    .eq("id", fighterId);

  if (error) {
    throw error;
  }
}

function findDuplicateActiveNames(fighters: WarbandFighter[]) {
  const counts = new Map<string, number>();

  for (const fighter of fighters) {
    const key = fighter.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}
