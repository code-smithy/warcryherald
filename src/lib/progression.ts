import type { SupabaseClient } from "@supabase/supabase-js";
import { getSingle, type GrandAlliance } from "./reference-data";
import type { Warband } from "./warbands";

export type WarbandProgress = {
  id: string;
  warband_id: string;
  glory: number;
  reputation: number;
  notes: string;
  updated_at: string;
};

export type ProgressionDraft = {
  glory: string;
  reputation: string;
  notes: string;
};

export type ProgressionSummary = {
  glory: number;
  reputation: number;
  notes: string;
  hasProgression: boolean;
};

export type ProgressionDefinition = {
  id: string;
  rules_release_id: string;
  stable_key: string;
  name: string;
  description: string;
  source_page: string | null;
  mechanics: Record<string, unknown>;
};

export type EncampmentDefinition = ProgressionDefinition;

export type QuestDefinition = ProgressionDefinition & {
  scope: "universal" | "grand_alliance" | "faction";
  grand_alliance_id: string | null;
  faction_id: string | null;
};

export type ArtefactDefinition = ProgressionDefinition & {
  category: "lesser_artefact" | "greater_artefact" | "campaign_reward" | "other";
};

export type HeroicTraitDefinition = ProgressionDefinition;

export type ProgressionDefinitions = {
  encampments: EncampmentDefinition[];
  quests: QuestDefinition[];
  artefacts: ArtefactDefinition[];
  heroicTraits: HeroicTraitDefinition[];
};

export type WarbandEncampment = {
  id: string;
  warband_id: string;
  encampment_definition_id: string;
  assigned_at: string;
  encampment_definitions?: EncampmentDefinition | EncampmentDefinition[] | null;
};

export type WarbandQuest = {
  id: string;
  warband_id: string;
  quest_definition_id: string;
  progress: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  quest_definitions?: QuestDefinition | QuestDefinition[] | null;
};

export type WarbandArtefact = {
  id: string;
  warband_id: string;
  artefact_definition_id: string;
  name: string;
  notes: string;
  acquired_at: string;
  artefact_definitions?: ArtefactDefinition | ArtefactDefinition[] | null;
  fighter_artefacts?: FighterArtefactAssignment[];
};

export type FighterArtefactAssignment = {
  id: string;
  warband_artefact_id: string;
  warband_fighter_id: string;
  assigned_at: string;
};

export type FighterHeroicTrait = {
  id: string;
  warband_fighter_id: string;
  heroic_trait_definition_id: string;
  assigned_at: string;
  heroic_trait_definitions?: HeroicTraitDefinition | HeroicTraitDefinition[] | null;
};

export type FighterRenown = {
  id: string;
  warband_fighter_id: string;
  renown: number;
  updated_at: string;
};

export type FighterInjury = {
  id: string;
  warband_fighter_id: string;
  name: string;
  description: string;
  recovered_at: string | null;
  created_at: string;
};

export type WarbandJournalEntry = {
  id: string;
  warband_id: string;
  event_type: string;
  summary: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type WarbandProgressionState = {
  progress: WarbandProgress | null;
  encampment: WarbandEncampment | null;
  quests: WarbandQuest[];
  artefacts: WarbandArtefact[];
  heroicTraits: FighterHeroicTrait[];
  renown: FighterRenown[];
  injuries: FighterInjury[];
  journal: WarbandJournalEntry[];
};

export type NumberDraftValidation = {
  normalized: number | null;
  errors: string[];
};

export const emptyProgressionState: WarbandProgressionState = {
  progress: null,
  encampment: null,
  quests: [],
  artefacts: [],
  heroicTraits: [],
  renown: [],
  injuries: [],
  journal: []
};

export function createProgressionDraft(progress?: Partial<WarbandProgress> | null): ProgressionDraft {
  return {
    glory: String(progress?.glory ?? 0),
    reputation: String(progress?.reputation ?? 0),
    notes: progress?.notes ?? ""
  };
}

export function validateProgressionDraft(draft: ProgressionDraft) {
  const normalized = {
    glory: parseWholeNumber(draft.glory),
    reputation: parseWholeNumber(draft.reputation),
    notes: draft.notes.trim()
  };
  const errors: string[] = [];

  if (normalized.glory === null || normalized.glory < 0) {
    errors.push("Glory must be a whole number of 0 or more.");
  }

  if (normalized.reputation === null || normalized.reputation < 0) {
    errors.push("Reputation must be a whole number of 0 or more.");
  }

  if (normalized.notes.length > 2000) {
    errors.push("Progression notes must be 2000 characters or fewer.");
  }

  return { normalized, errors };
}

export function validateNonNegativeNumberDraft(value: string, label: string): NumberDraftValidation {
  const normalized = parseWholeNumber(value);

  if (normalized === null || normalized < 0) {
    return { normalized, errors: [`${label} must be a whole number of 0 or more.`] };
  }

  return { normalized, errors: [] };
}

export function summarizeProgression(progress?: Partial<WarbandProgress> | null): ProgressionSummary {
  return {
    glory: progress?.glory ?? 0,
    reputation: progress?.reputation ?? 0,
    notes: progress?.notes ?? "",
    hasProgression: Boolean(progress)
  };
}

export function filterProgressionDefinitionsForWarband(
  definitions: ProgressionDefinitions,
  warband: Pick<Warband, "faction_id" | "rules_release_id" | "factions">
) {
  const grandAlliance = getWarbandGrandAlliance(warband);

  return {
    encampments: definitions.encampments,
    quests: definitions.quests.filter(
      (quest) =>
        quest.scope === "universal" ||
        (quest.scope === "grand_alliance" && quest.grand_alliance_id === grandAlliance?.id) ||
        (quest.scope === "faction" && quest.faction_id === warband.faction_id)
    ),
    artefacts: definitions.artefacts,
    heroicTraits: definitions.heroicTraits
  };
}

export function getDefinitionName<T extends ProgressionDefinition>(
  relation: T | T[] | null | undefined,
  fallback = "Unknown definition"
) {
  return getSingle(relation)?.name ?? fallback;
}

export function getWarbandGrandAlliance(
  warband: Pick<Warband, "factions"> | null | undefined
): GrandAlliance | null {
  return getSingle(getSingle(warband?.factions)?.grand_alliances) ?? null;
}

export async function listProgressionDefinitions(client: SupabaseClient): Promise<ProgressionDefinitions> {
  const [encampments, quests, artefacts, heroicTraits] = await Promise.all([
    selectDefinitionTable<EncampmentDefinition>(client, "encampment_definitions"),
    selectDefinitionTable<QuestDefinition>(client, "quest_definitions"),
    selectDefinitionTable<ArtefactDefinition>(client, "artefact_definitions"),
    selectDefinitionTable<HeroicTraitDefinition>(client, "heroic_trait_definitions")
  ]);

  return { encampments, quests, artefacts, heroicTraits };
}

export async function getWarbandProgressionState(
  client: SupabaseClient,
  warband: Pick<Warband, "id" | "warband_fighters">
): Promise<WarbandProgressionState> {
  const fighterIds = (warband.warband_fighters ?? []).map((fighter) => fighter.id);

  const [
    progressResult,
    encampmentResult,
    questsResult,
    artefactsResult,
    heroicTraits,
    renown,
    injuries,
    journalResult
  ] = await Promise.all([
    client.from("warband_progress").select("*").eq("warband_id", warband.id).maybeSingle(),
    client
      .from("warband_encampments")
      .select("*, encampment_definitions(*)")
      .eq("warband_id", warband.id)
      .maybeSingle(),
    client
      .from("warband_quests")
      .select("*, quest_definitions(*)")
      .eq("warband_id", warband.id)
      .order("completed_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false }),
    client
      .from("warband_artefacts")
      .select("*, artefact_definitions(*), fighter_artefacts(*)")
      .eq("warband_id", warband.id)
      .order("acquired_at", { ascending: false }),
    selectFighterRows<FighterHeroicTrait>(
      client,
      "fighter_heroic_traits",
      "*, heroic_trait_definitions(*)",
      fighterIds
    ),
    selectFighterRows<FighterRenown>(client, "fighter_renown", "*", fighterIds),
    selectFighterRows<FighterInjury>(client, "fighter_injuries", "*", fighterIds),
    client
      .from("warband_journal_entries")
      .select("*")
      .eq("warband_id", warband.id)
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  throwFirstError([
    progressResult.error,
    encampmentResult.error,
    questsResult.error,
    artefactsResult.error,
    heroicTraits.error,
    renown.error,
    injuries.error,
    journalResult.error
  ]);

  return {
    progress: (progressResult.data as WarbandProgress | null) ?? null,
    encampment: (encampmentResult.data as WarbandEncampment | null) ?? null,
    quests: (questsResult.data ?? []) as WarbandQuest[],
    artefacts: (artefactsResult.data ?? []) as WarbandArtefact[],
    heroicTraits: heroicTraits.data,
    renown: renown.data,
    injuries: injuries.data,
    journal: (journalResult.data ?? []) as WarbandJournalEntry[]
  };
}

export async function saveWarbandProgress(
  client: SupabaseClient,
  warbandId: string,
  draft: ProgressionDraft
) {
  const { normalized, errors } = validateProgressionDraft(draft);

  if (errors.length > 0 || normalized.glory === null || normalized.reputation === null) {
    throw new Error(errors.join(" "));
  }

  const { data, error } = await client
    .from("warband_progress")
    .upsert(
      {
        warband_id: warbandId,
        glory: normalized.glory,
        reputation: normalized.reputation,
        notes: normalized.notes
      },
      { onConflict: "warband_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as WarbandProgress;
}

export async function setWarbandEncampment(
  client: SupabaseClient,
  warbandId: string,
  encampmentDefinitionId: string
) {
  if (!encampmentDefinitionId) {
    const { error } = await client.from("warband_encampments").delete().eq("warband_id", warbandId);

    if (error) {
      throw error;
    }

    return null;
  }

  const { data, error } = await client
    .from("warband_encampments")
    .upsert(
      { warband_id: warbandId, encampment_definition_id: encampmentDefinitionId },
      { onConflict: "warband_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as WarbandEncampment;
}

export async function startWarbandQuest(
  client: SupabaseClient,
  warbandId: string,
  questDefinitionId: string
) {
  if (!questDefinitionId) {
    throw new Error("Choose a quest to start.");
  }

  const { data, error } = await client
    .from("warband_quests")
    .insert({ warband_id: warbandId, quest_definition_id: questDefinitionId })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as WarbandQuest;
}

export async function updateWarbandQuestProgress(
  client: SupabaseClient,
  questId: string,
  progress: string
) {
  const { normalized, errors } = validateNonNegativeNumberDraft(progress, "Quest progress");

  if (errors.length > 0 || normalized === null) {
    throw new Error(errors.join(" "));
  }

  const { error } = await client
    .from("warband_quests")
    .update({ progress: normalized })
    .eq("id", questId);

  if (error) {
    throw error;
  }
}

export async function completeWarbandQuest(client: SupabaseClient, questId: string) {
  const { error } = await client
    .from("warband_quests")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", questId);

  if (error) {
    throw error;
  }
}

export async function abandonWarbandQuest(client: SupabaseClient, questId: string) {
  const { error } = await client.from("warband_quests").delete().eq("id", questId);

  if (error) {
    throw error;
  }
}

export async function addWarbandArtefact(
  client: SupabaseClient,
  warbandId: string,
  artefactDefinition: Pick<ArtefactDefinition, "id" | "name"> | null,
  notes: string
) {
  if (!artefactDefinition) {
    throw new Error("Choose an artefact to add.");
  }

  const { data, error } = await client
    .from("warband_artefacts")
    .insert({
      warband_id: warbandId,
      artefact_definition_id: artefactDefinition.id,
      name: artefactDefinition.name,
      notes: notes.trim()
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as WarbandArtefact;
}

export async function updateWarbandArtefactNotes(
  client: SupabaseClient,
  artefactId: string,
  notes: string
) {
  const { error } = await client
    .from("warband_artefacts")
    .update({ notes: notes.trim() })
    .eq("id", artefactId);

  if (error) {
    throw error;
  }
}

export async function removeWarbandArtefact(client: SupabaseClient, artefactId: string) {
  const { error } = await client.from("warband_artefacts").delete().eq("id", artefactId);

  if (error) {
    throw error;
  }
}

export async function assignFighterArtefact(
  client: SupabaseClient,
  warbandArtefactId: string,
  warbandFighterId: string
) {
  if (!warbandFighterId) {
    const { error } = await client
      .from("fighter_artefacts")
      .delete()
      .eq("warband_artefact_id", warbandArtefactId);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await client
    .from("fighter_artefacts")
    .upsert(
      { warband_artefact_id: warbandArtefactId, warband_fighter_id: warbandFighterId },
      { onConflict: "warband_artefact_id" }
    );

  if (error) {
    throw error;
  }
}

export async function saveFighterRenown(
  client: SupabaseClient,
  warbandFighterId: string,
  renown: string
) {
  const { normalized, errors } = validateNonNegativeNumberDraft(renown, "Renown");

  if (errors.length > 0 || normalized === null) {
    throw new Error(errors.join(" "));
  }

  const { error } = await client
    .from("fighter_renown")
    .upsert(
      { warband_fighter_id: warbandFighterId, renown: normalized },
      { onConflict: "warband_fighter_id" }
    );

  if (error) {
    throw error;
  }
}

export async function addFighterHeroicTrait(
  client: SupabaseClient,
  warbandFighterId: string,
  heroicTraitDefinitionId: string
) {
  if (!heroicTraitDefinitionId) {
    throw new Error("Choose a heroic trait to add.");
  }

  const { error } = await client
    .from("fighter_heroic_traits")
    .insert({
      warband_fighter_id: warbandFighterId,
      heroic_trait_definition_id: heroicTraitDefinitionId
    });

  if (error) {
    throw error;
  }
}

export async function removeFighterHeroicTrait(client: SupabaseClient, traitId: string) {
  const { error } = await client.from("fighter_heroic_traits").delete().eq("id", traitId);

  if (error) {
    throw error;
  }
}

export async function addFighterInjury(
  client: SupabaseClient,
  warbandFighterId: string,
  name: string,
  description: string
) {
  const normalizedName = name.trim();

  if (normalizedName.length < 2) {
    throw new Error("Injury name must be at least 2 characters.");
  }

  const { error } = await client.from("fighter_injuries").insert({
    warband_fighter_id: warbandFighterId,
    name: normalizedName,
    description: description.trim()
  });

  if (error) {
    throw error;
  }
}

export async function recoverFighterInjury(client: SupabaseClient, injuryId: string) {
  const { error } = await client
    .from("fighter_injuries")
    .update({ recovered_at: new Date().toISOString() })
    .eq("id", injuryId);

  if (error) {
    throw error;
  }
}

async function selectDefinitionTable<T>(client: SupabaseClient, table: string) {
  const { data, error } = await client.from(table).select("*").order("name", { ascending: true });

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
    return { data: [] as T[], error: null };
  }

  const { data, error } = await client
    .from(table)
    .select(select)
    .in("warband_fighter_id", fighterIds);

  return { data: (data ?? []) as T[], error };
}

function throwFirstError(errors: Array<{ message?: string } | null | undefined>) {
  const error = errors.find(Boolean);

  if (error) {
    throw error;
  }
}

function parseWholeNumber(value: string) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}
