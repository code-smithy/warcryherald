import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const referenceDir = resolve(process.cwd(), "data", "reference");
const abilitiesPath = resolve(referenceDir, "abilities.json");
const factionsPath = resolve(referenceDir, "factions.json");

const abilitiesPayload = JSON.parse(readFileSync(abilitiesPath, "utf8"));
const factionsPayload = JSON.parse(readFileSync(factionsPath, "utf8"));
const factionStableKeys = new Set(
  factionsPayload.factions.map((faction) => faction.stableKey)
);

let assignedFaction = 0;
let assignedNonFactionScope = 0;

for (const ability of abilitiesPayload.abilities) {
  if (ability.isUniversal || ability.factionStableKey) {
    continue;
  }

  const factionStableKey = factionStableKeyFromSource(
    ability.sourceDocumentStableKey,
    factionStableKeys
  );

  if (factionStableKey) {
    ability.factionStableKey = factionStableKey;
    assignedFaction += 1;
  } else {
    // The current schema has two scopes: faction-scoped and non-faction-scoped.
    // Scenario, terrain, matched-play, and grand-alliance rules are independent
    // of one faction, so they use the non-faction (universal) scope. Their
    // source document and runemarks retain the narrower rules context.
    ability.isUniversal = true;
    ability.factionStableKey = null;
    assignedNonFactionScope += 1;
  }
}

const invalidAbilities = abilitiesPayload.abilities.filter(
  (ability) => !ability.isUniversal && !ability.factionStableKey
);
const missingFactionReferences = abilitiesPayload.abilities.filter(
  (ability) =>
    ability.factionStableKey &&
    !factionStableKeys.has(ability.factionStableKey)
);

if (invalidAbilities.length > 0) {
  throw new Error(
    `${invalidAbilities.length} faction abilities still lack factionStableKey`
  );
}

if (missingFactionReferences.length > 0) {
  throw new Error(
    `${missingFactionReferences.length} abilities reference unknown factions`
  );
}

writeFileSync(
  abilitiesPath,
  `${JSON.stringify(abilitiesPayload, null, 2)}\n`,
  "utf8"
);

console.log(`assigned factionStableKey: ${assignedFaction}`);
console.log(`assigned non-faction scope: ${assignedNonFactionScope}`);

function factionStableKeyFromSource(sourceDocumentStableKey, knownFactionKeys) {
  const prefix = "warcrier-warbands-";
  const suffix = "-en";

  if (
    typeof sourceDocumentStableKey !== "string" ||
    !sourceDocumentStableKey.startsWith(prefix) ||
    !sourceDocumentStableKey.endsWith(suffix)
  ) {
    return null;
  }

  let sourceSlug = sourceDocumentStableKey.slice(
    prefix.length,
    -suffix.length
  );

  if (sourceSlug.endsWith("-quests")) {
    sourceSlug = sourceSlug.slice(0, -"-quests".length);
  }

  const candidate = `en-${sourceSlug}`;
  return knownFactionKeys.has(candidate) ? candidate : null;
}
