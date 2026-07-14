import type { SupabaseClient } from "@supabase/supabase-js";

export type RulesReleaseStatus = "draft" | "current" | "retired";

export type RulesRelease = {
  id: string;
  stable_key: string;
  name: string;
  release_date: string;
  language: string;
  status: RulesReleaseStatus;
  source_url: string | null;
  source_documents?: SourceDocument | SourceDocument[] | null;
};

export type SourceDocument = {
  id?: string;
  stable_key?: string;
  title: string;
  source_url: string | null;
  language?: string;
};

export type GrandAlliance = {
  id: string;
  stable_key: string;
  name: string;
};

export type Faction = {
  id: string;
  stable_key: string;
  rules_release_id?: string;
  grand_alliance_id?: string;
  name: string;
  grand_alliances?: GrandAlliance | GrandAlliance[] | null;
};

export type Runemark = {
  id: string;
  stable_key: string;
  name: string;
  category: string;
};

export type WeaponProfile = {
  id: string;
  stable_key: string;
  name: string;
  range_min: number;
  range_max: number;
  attacks: number;
  strength: number;
  damage: number;
  critical_damage: number;
};

export type FighterProfileRunemark = {
  runemarks?: Runemark | Runemark[] | null;
};

export type FighterProfile = {
  id: string;
  stable_key: string;
  name: string;
  movement: number;
  toughness: number;
  wounds: number;
  points: number;
  base_size_mm: number | null;
  is_leader: boolean;
  is_current: boolean;
  source_page: string | null;
  factions?: Faction | Faction[] | null;
  rules_releases?: RulesRelease | RulesRelease[] | null;
  weapon_profiles?: WeaponProfile[];
  fighter_profile_runemarks?: FighterProfileRunemark[];
};

export type ReferenceFilters = {
  search: string;
  factionKey: string;
  grandAllianceKey: string;
  runemarkKey: string;
  includeRetired: boolean;
};

export async function listRulesReleases(client: SupabaseClient) {
  const { data, error } = await client
    .from("rules_releases")
    .select("*, source_documents(title, source_url, language)")
    .order("release_date", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as RulesRelease[];
}

export async function listFactions(client: SupabaseClient) {
  const { data, error } = await client
    .from("factions")
    .select("*, grand_alliances(id, stable_key, name)")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Faction[];
}

export async function listRunemarks(client: SupabaseClient) {
  const { data, error } = await client
    .from("runemarks")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Runemark[];
}

export async function listFighterProfiles(client: SupabaseClient) {
  const { data, error } = await client
    .from("fighter_profiles")
    .select(
      `
      *,
      factions(id, stable_key, name, grand_alliances(id, stable_key, name)),
      rules_releases(id, stable_key, name, release_date, language, status, source_url, source_documents(title, source_url, language)),
      weapon_profiles(id, stable_key, name, range_min, range_max, attacks, strength, damage, critical_damage),
      fighter_profile_runemarks(runemarks(id, stable_key, name, category))
    `
    )
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as FighterProfile[];
}

export function filterFighterProfiles(
  fighters: FighterProfile[],
  filters: ReferenceFilters
) {
  const query = filters.search.trim().toLowerCase();

  return fighters.filter((fighter) => {
    const faction = getSingle(fighter.factions);
    const alliance = getSingle(faction?.grand_alliances);
    const release = getSingle(fighter.rules_releases);
    const runemarks = getFighterRunemarks(fighter);

    if (!filters.includeRetired && (!fighter.is_current || release?.status === "retired")) {
      return false;
    }

    if (filters.factionKey && faction?.stable_key !== filters.factionKey) {
      return false;
    }

    if (filters.grandAllianceKey && alliance?.stable_key !== filters.grandAllianceKey) {
      return false;
    }

    if (
      filters.runemarkKey &&
      !runemarks.some((runemark) => runemark.stable_key === filters.runemarkKey)
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    return getFighterSearchText(fighter).includes(query);
  });
}

export function getFighterSearchText(fighter: FighterProfile) {
  const faction = getSingle(fighter.factions);
  const alliance = getSingle(faction?.grand_alliances);
  const release = getSingle(fighter.rules_releases);
  const runemarks = getFighterRunemarks(fighter);

  return [
    fighter.name,
    fighter.stable_key,
    faction?.name,
    alliance?.name,
    release?.name,
    ...runemarks.map((runemark) => runemark.name)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getFighterRunemarks(fighter: FighterProfile) {
  return (fighter.fighter_profile_runemarks ?? [])
    .map((row) => getSingle(row.runemarks))
    .filter((runemark): runemark is Runemark => Boolean(runemark));
}

export function getSingle<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function formatWeaponRange(weapon: WeaponProfile) {
  return weapon.range_min === weapon.range_max
    ? String(weapon.range_max)
    : `${weapon.range_min}-${weapon.range_max}`;
}

export function getSourceLabel(fighter: FighterProfile) {
  const release = getSingle(fighter.rules_releases);
  const source = getSingle(release?.source_documents);
  const page = fighter.source_page ? `, p. ${fighter.source_page}` : "";

  if (source?.title && release?.name) {
    return `${release.name} - ${source.title}${page}`;
  }

  return release?.name ?? "Source release unavailable";
}
