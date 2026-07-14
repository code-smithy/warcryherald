import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

loadDotEnv();

function loadReferenceDataset() {
  const referenceDir = resolve(process.cwd(), "data", "reference");
  const releases = readJsonFile(resolve(referenceDir, "releases.json"));
  const factions = readJsonFile(resolve(referenceDir, "factions.json"));
  const runemarks = readJsonFile(resolve(referenceDir, "runemarks.json"));
  const fighters = readJsonFile(resolve(referenceDir, "fighters.json"));
  const weapons = readJsonFile(resolve(referenceDir, "weapons.json"));
  const abilities = readJsonFile(resolve(referenceDir, "abilities.json"));

  return referenceDatasetSchema.parse({
    sourceDocuments: releases.sourceDocuments,
    releases: releases.releases,
    grandAlliances: factions.grandAlliances,
    factions: factions.factions,
    runemarks: runemarks.runemarks,
    fighters: fighters.fighters,
    weapons: weapons.weapons,
    abilities: abilities.abilities,
    blessings: abilities.blessings
  });
}

function validateReferenceDataset(value) {
  const errors = [];
  const sourceDocuments = mapByStableKey(value.sourceDocuments, "source document", errors);
  const releases = mapByStableKey(value.releases, "rules release", errors);
  const grandAlliances = mapByStableKey(value.grandAlliances, "grand alliance", errors);
  const factions = mapByStableKey(value.factions, "faction", errors);
  const runemarks = mapByStableKey(value.runemarks, "runemark", errors);
  const fighters = mapByStableKey(value.fighters, "fighter", errors);
  const weapons = mapByStableKey(value.weapons, "weapon", errors);
  const abilities = mapByStableKey(value.abilities, "ability", errors);
  const blessings = mapByStableKey(value.blessings, "blessing", errors);

  for (const release of value.releases) {
    requireReference(
      sourceDocuments,
      release.sourceDocumentStableKey,
      `release ${release.stableKey}`,
      "source document",
      errors
    );
  }

  for (const faction of value.factions) {
    requireReference(
      releases,
      faction.rulesReleaseStableKey,
      `faction ${faction.stableKey}`,
      "rules release",
      errors
    );
    requireReference(
      grandAlliances,
      faction.grandAllianceStableKey,
      `faction ${faction.stableKey}`,
      "grand alliance",
      errors
    );
  }

  for (const fighter of value.fighters) {
    requireReference(
      releases,
      fighter.rulesReleaseStableKey,
      `fighter ${fighter.stableKey}`,
      "rules release",
      errors
    );
    requireReference(
      factions,
      fighter.factionStableKey,
      `fighter ${fighter.stableKey}`,
      "faction",
      errors
    );
    requireReference(
      sourceDocuments,
      fighter.sourceDocumentStableKey,
      `fighter ${fighter.stableKey}`,
      "source document",
      errors
    );

    for (const runemarkKey of fighter.runemarkStableKeys) {
      requireReference(
        runemarks,
        runemarkKey,
        `fighter ${fighter.stableKey}`,
        "runemark",
        errors
      );
    }
  }

  for (const weapon of value.weapons) {
    requireReference(
      fighters,
      weapon.fighterStableKey,
      `weapon ${weapon.stableKey}`,
      "fighter",
      errors
    );
  }

  for (const ability of value.abilities) {
    requireReference(
      releases,
      ability.rulesReleaseStableKey,
      `ability ${ability.stableKey}`,
      "rules release",
      errors
    );
    requireReference(
      factions,
      ability.factionStableKey,
      `ability ${ability.stableKey}`,
      "faction",
      errors
    );
    requireReference(
      sourceDocuments,
      ability.sourceDocumentStableKey,
      `ability ${ability.stableKey}`,
      "source document",
      errors
    );

    for (const runemarkKey of ability.runemarkStableKeys) {
      requireReference(
        runemarks,
        runemarkKey,
        `ability ${ability.stableKey}`,
        "runemark",
        errors
      );
    }
  }

  for (const blessing of value.blessings) {
    requireReference(
      releases,
      blessing.rulesReleaseStableKey,
      `blessing ${blessing.stableKey}`,
      "rules release",
      errors
    );
    requireReference(
      sourceDocuments,
      blessing.sourceDocumentStableKey,
      `blessing ${blessing.stableKey}`,
      "source document",
      errors
    );
  }

  return {
    errors,
    maps: {
      sourceDocuments,
      releases,
      grandAlliances,
      factions,
      runemarks,
      fighters,
      weapons,
      abilities,
      blessings
    },
    summary: {
      sourceDocuments: value.sourceDocuments.length,
      releases: value.releases.length,
      retiredReleases: value.releases.filter((release) => release.status === "retired").length,
      grandAlliances: value.grandAlliances.length,
      factions: value.factions.length,
      runemarks: value.runemarks.length,
      fighters: value.fighters.length,
      retiredFighters: value.fighters.filter((fighter) => !fighter.isCurrent).length,
      weapons: value.weapons.length,
      abilities: value.abilities.length,
      blessings: value.blessings.length
    }
  };
}

async function importReferenceDataset(value, validationResult, mode) {
  printValidationSummary(validationResult);

  if (mode === "local-dry-run") {
    console.log("ok - dry run complete; no remote data changed");
    return;
  }

  const supabaseUrl = getRequiredEnv("VITE_SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createRestClient(supabaseUrl, serviceRoleKey);

  if (mode === "remote-check") {
    await client.selectStableKeys("rules_releases");
    console.log("ok - remote reference-data configuration is reachable");
    return;
  }

  const importSummary = [];

  const sourceDocuments = await upsertStableRows(
    client,
    "source_documents",
    value.sourceDocuments.map((document) => ({
      stable_key: document.stableKey,
      title: document.title,
      publisher: document.publisher,
      source_url: document.sourceUrl,
      language: document.language,
      published_at: document.publishedAt
    })),
    importSummary
  );
  const sourceDocumentIds = indexRowsByStableKey(sourceDocuments);

  const releases = await upsertStableRows(
    client,
    "rules_releases",
    value.releases.map((release) => ({
      stable_key: release.stableKey,
      source_document_id: nullableId(sourceDocumentIds, release.sourceDocumentStableKey),
      name: release.name,
      release_date: release.releaseDate,
      language: release.language,
      status: release.status,
      source_url: release.sourceUrl,
      imported_at: new Date().toISOString()
    })),
    importSummary
  );
  const releaseIds = indexRowsByStableKey(releases);

  const grandAlliances = await upsertStableRows(
    client,
    "grand_alliances",
    value.grandAlliances.map((alliance) => ({
      stable_key: alliance.stableKey,
      name: alliance.name,
      display_order: alliance.displayOrder
    })),
    importSummary
  );
  const grandAllianceIds = indexRowsByStableKey(grandAlliances);

  const factions = await upsertStableRows(
    client,
    "factions",
    value.factions.map((faction) => ({
      stable_key: faction.stableKey,
      rules_release_id: releaseIds.get(faction.rulesReleaseStableKey),
      grand_alliance_id: grandAllianceIds.get(faction.grandAllianceStableKey),
      name: faction.name,
      display_order: faction.displayOrder
    })),
    importSummary
  );
  const factionIds = indexRowsByStableKey(factions);

  const runemarks = await upsertStableRows(
    client,
    "runemarks",
    value.runemarks.map((runemark) => ({
      stable_key: runemark.stableKey,
      name: runemark.name,
      category: runemark.category,
      display_order: runemark.displayOrder
    })),
    importSummary
  );
  const runemarkIds = indexRowsByStableKey(runemarks);

  const fighters = await upsertStableRows(
    client,
    "fighter_profiles",
    value.fighters.map((fighter) => ({
      stable_key: fighter.stableKey,
      rules_release_id: releaseIds.get(fighter.rulesReleaseStableKey),
      faction_id: factionIds.get(fighter.factionStableKey),
      name: fighter.name,
      movement: fighter.movement,
      toughness: fighter.toughness,
      wounds: fighter.wounds,
      points: fighter.points,
      base_size_mm: fighter.baseSizeMm,
      is_leader: fighter.isLeader,
      is_current: fighter.isCurrent,
      source_document_id: nullableId(sourceDocumentIds, fighter.sourceDocumentStableKey),
      source_page: fighter.sourcePage
    })),
    importSummary
  );
  const fighterIds = indexRowsByStableKey(fighters);

  await upsertCompositeRows(
    client,
    "fighter_profile_runemarks",
    "fighter_profile_id,runemark_id",
    value.fighters.flatMap((fighter) =>
      fighter.runemarkStableKeys.map((runemarkKey) => ({
        fighter_profile_id: fighterIds.get(fighter.stableKey),
        runemark_id: runemarkIds.get(runemarkKey)
      }))
    ),
    importSummary
  );

  await upsertStableRows(
    client,
    "weapon_profiles",
    value.weapons.map((weapon) => ({
      stable_key: weapon.stableKey,
      fighter_profile_id: fighterIds.get(weapon.fighterStableKey),
      name: weapon.name,
      range_min: weapon.rangeMin,
      range_max: weapon.rangeMax,
      attacks: weapon.attacks,
      strength: weapon.strength,
      damage: weapon.damage,
      critical_damage: weapon.criticalDamage
    })),
    importSummary
  );

  const abilities = await upsertStableRows(
    client,
    "abilities",
    value.abilities.map((ability) => ({
      stable_key: ability.stableKey,
      rules_release_id: releaseIds.get(ability.rulesReleaseStableKey),
      name: ability.name,
      ability_type: ability.isUniversal ? "universal" : "faction",
      cost: ability.cost,
      effect: ability.effect,
      source_document_id: nullableId(sourceDocumentIds, ability.sourceDocumentStableKey),
      source_page: ability.sourcePage
    })),
    importSummary
  );
  const abilityIds = indexRowsByStableKey(abilities);

  await upsertCompositeRows(
    client,
    "ability_runemarks",
    "ability_id,runemark_id",
    value.abilities.flatMap((ability) =>
      ability.runemarkStableKeys.map((runemarkKey) => ({
        ability_id: abilityIds.get(ability.stableKey),
        runemark_id: runemarkIds.get(runemarkKey)
      }))
    ),
    importSummary
  );

  await upsertCompositeRows(
    client,
    "faction_abilities",
    "faction_id,ability_id",
    value.abilities
      .filter((ability) => ability.factionStableKey)
      .map((ability) => ({
        faction_id: factionIds.get(ability.factionStableKey),
        ability_id: abilityIds.get(ability.stableKey)
      })),
    importSummary
  );

  await upsertCompositeRows(
    client,
    "universal_abilities",
    "ability_id",
    value.abilities
      .filter((ability) => ability.isUniversal)
      .map((ability) => ({ ability_id: abilityIds.get(ability.stableKey) })),
    importSummary
  );

  await upsertStableRows(
    client,
    "blessings",
    value.blessings.map((blessing) => ({
      stable_key: blessing.stableKey,
      rules_release_id: releaseIds.get(blessing.rulesReleaseStableKey),
      name: blessing.name,
      effect: blessing.effect,
      points: blessing.points,
      source_document_id: nullableId(sourceDocumentIds, blessing.sourceDocumentStableKey),
      source_page: blessing.sourcePage
    })),
    importSummary
  );

  for (const line of importSummary) {
    console.log(line);
  }
}

async function upsertStableRows(client, table, rows, summary) {
  if (rows.length === 0) {
    summary.push(`ok - ${table}: inserted 0, updated 0`);
    return [];
  }

  const existing = await client.selectStableKeys(table);
  const inserted = rows.filter((row) => !existing.has(row.stable_key)).length;
  const updated = rows.length - inserted;
  const result = await client.upsert(table, "stable_key", rows);
  summary.push(`ok - ${table}: inserted ${inserted}, updated ${updated}`);
  return result;
}

async function upsertCompositeRows(client, table, conflictTarget, rows, summary) {
  const cleanRows = rows.filter((row) => Object.values(row).every(Boolean));

  if (cleanRows.length === 0) {
    summary.push(`ok - ${table}: upserted 0`);
    return [];
  }

  const result = await client.upsert(table, conflictTarget, cleanRows);
  summary.push(`ok - ${table}: upserted ${result.length}`);
  return result;
}

function createRestClient(supabaseUrl, serviceRoleKey) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };

  return {
    async selectStableKeys(table) {
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=stable_key`, {
        headers
      });
      const payload = await parseResponse(response);
      return new Set(payload.map((row) => row.stable_key));
    },
    async upsert(table, conflictTarget, rows) {
      const params = new URLSearchParams({
        on_conflict: conflictTarget,
        select: "*"
      });
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify(rows)
      });
      return parseResponse(response);
    }
  };
}

async function parseResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        payload?.details ??
        `Supabase request failed with ${response.status}`
    );
  }

  return payload ?? [];
}

function printValidationSummary(result) {
  console.log("ok - reference data validation passed");
  console.log(
    [
      `sourceDocuments=${result.summary.sourceDocuments}`,
      `releases=${result.summary.releases}`,
      `retiredReleases=${result.summary.retiredReleases}`,
      `grandAlliances=${result.summary.grandAlliances}`,
      `factions=${result.summary.factions}`,
      `runemarks=${result.summary.runemarks}`,
      `fighters=${result.summary.fighters}`,
      `retiredFighters=${result.summary.retiredFighters}`,
      `weapons=${result.summary.weapons}`,
      `abilities=${result.summary.abilities}`,
      `blessings=${result.summary.blessings}`
    ].join(" ")
  );
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function mapByStableKey(items, label, errors) {
  const map = new Map();

  for (const item of items) {
    if (map.has(item.stableKey)) {
      errors.push(`Duplicate ${label} stable key: ${item.stableKey}`);
    }

    map.set(item.stableKey, item);
  }

  return map;
}

function requireReference(map, key, subject, label, errors) {
  if (key && !map.has(key)) {
    errors.push(`${subject} references missing ${label}: ${key}`);
  }
}

function indexRowsByStableKey(rows) {
  return new Map(rows.map((row) => [row.stable_key, row.id]));
}

function nullableId(map, stableKey) {
  return stableKey ? map.get(stableKey) : null;
}

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for reference-data import.`);
  }

  return value;
}

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");

  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue = ""] = match;

    if (process.env[key]) {
      continue;
    }

    process.env[key] = parseDotEnvValue(rawValue);
  }
}

function parseDotEnvValue(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

const stableKey = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const optionalSourceDocumentKey = z.string().optional().nullable().transform((value) => value ?? null);
const positiveInt = z.number().int().positive();

const sourceDocumentSchema = z.object({
  stableKey,
  title: z.string().trim().min(1).max(160),
  publisher: z.string().default(""),
  sourceUrl: z.string().url().optional().nullable().transform((value) => value ?? null),
  language: z.string().trim().min(2).max(12).default("en"),
  publishedAt: z.string().date().optional().nullable().transform((value) => value ?? null)
});

const releaseSchema = z.object({
  stableKey,
  sourceDocumentStableKey: optionalSourceDocumentKey,
  name: z.string().trim().min(1).max(120),
  releaseDate: z.string().date(),
  language: z.string().trim().min(2).max(12).default("en"),
  status: z.enum(["draft", "current", "retired"]).default("draft"),
  sourceUrl: z.string().url().optional().nullable().transform((value) => value ?? null)
});

const grandAllianceSchema = z.object({
  stableKey,
  name: z.string().trim().min(1).max(80),
  displayOrder: z.number().int().default(0)
});

const factionSchema = z.object({
  stableKey,
  rulesReleaseStableKey: stableKey,
  grandAllianceStableKey: stableKey,
  name: z.string().trim().min(1).max(120),
  displayOrder: z.number().int().default(0)
});

const runemarkSchema = z.object({
  stableKey,
  name: z.string().trim().min(1).max(80),
  category: z.enum(["fighter", "faction", "ability", "universal"]).default("fighter"),
  displayOrder: z.number().int().default(0)
});

const fighterSchema = z.object({
  stableKey,
  rulesReleaseStableKey: stableKey,
  factionStableKey: stableKey,
  name: z.string().trim().min(1).max(120),
  movement: z.number().int().min(1).max(20),
  toughness: z.number().int().min(1).max(20),
  wounds: z.number().int().min(1).max(200),
  points: positiveInt,
  baseSizeMm: positiveInt.optional().nullable().transform((value) => value ?? null),
  isLeader: z.boolean().default(false),
  isCurrent: z.boolean().default(true),
  runemarkStableKeys: z.array(stableKey).default([]),
  sourceDocumentStableKey: optionalSourceDocumentKey,
  sourcePage: z.string().optional().nullable().transform((value) => value ?? null)
});

const weaponSchema = z.object({
  stableKey,
  fighterStableKey: stableKey,
  name: z.string().trim().min(1).max(120),
  rangeMin: z.number().int().min(0).default(1),
  rangeMax: z.number().int().min(0),
  attacks: z.number().int().min(1).max(20),
  strength: z.number().int().min(1).max(20),
  damage: z.number().int().min(0),
  criticalDamage: z.number().int().min(0)
}).refine((weapon) => weapon.rangeMax >= weapon.rangeMin, {
  message: "rangeMax must be greater than or equal to rangeMin"
}).refine((weapon) => weapon.criticalDamage >= weapon.damage, {
  message: "criticalDamage must be greater than or equal to damage"
});

const abilitySchema = z.object({
  stableKey,
  rulesReleaseStableKey: stableKey,
  factionStableKey: z.string().optional().nullable().transform((value) => value ?? null),
  name: z.string().trim().min(1).max(120),
  isUniversal: z.boolean().default(false),
  cost: z.string().default(""),
  effect: z.string().default(""),
  runemarkStableKeys: z.array(stableKey).default([]),
  sourceDocumentStableKey: optionalSourceDocumentKey,
  sourcePage: z.string().optional().nullable().transform((value) => value ?? null)
}).refine((ability) => ability.isUniversal || ability.factionStableKey, {
  message: "faction abilities must provide factionStableKey"
});

const blessingSchema = z.object({
  stableKey,
  rulesReleaseStableKey: stableKey,
  name: z.string().trim().min(1).max(120),
  effect: z.string().default(""),
  points: z.number().int().min(0).optional().nullable().transform((value) => value ?? null),
  sourceDocumentStableKey: optionalSourceDocumentKey,
  sourcePage: z.string().optional().nullable().transform((value) => value ?? null)
});

const referenceDatasetSchema = z.object({
  sourceDocuments: z.array(sourceDocumentSchema),
  releases: z.array(releaseSchema),
  grandAlliances: z.array(grandAllianceSchema),
  factions: z.array(factionSchema),
  runemarks: z.array(runemarkSchema),
  fighters: z.array(fighterSchema),
  weapons: z.array(weaponSchema),
  abilities: z.array(abilitySchema),
  blessings: z.array(blessingSchema)
});

async function main() {
  const command = process.argv[2] ?? "validate";
  const dryRun = process.argv.includes("--dry-run");
  const checkRemote = process.argv.includes("--check-remote");
  const dataset = loadReferenceDataset();
  const validation = validateReferenceDataset(dataset);

  if (validation.errors.length > 0) {
    for (const error of validation.errors) {
      console.error(`not ok - ${error}`);
    }
    process.exit(1);
  }

  if (command === "validate") {
    printValidationSummary(validation);
  } else if (command === "import") {
    await importReferenceDataset(
      dataset,
      validation,
      checkRemote ? "remote-check" : dryRun ? "local-dry-run" : "import"
    );
  } else {
    console.error(
      "Usage: node scripts/reference-data.mjs validate|import [--dry-run|--check-remote]"
    );
    process.exit(1);
  }
}

await main();
