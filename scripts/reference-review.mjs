import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const command = process.argv[2] ?? "draft";

if (command === "draft") {
  createReviewDraft();
} else if (command === "promote") {
  promoteReviewDraft();
} else {
  fail(
    "Usage: node scripts/reference-review.mjs draft --extract <workbench-json> [--out <review-json>] | promote --review <review-json> [--dir <reference-dir>]"
  );
}

function createReviewDraft() {
  const extractPath = resolve(process.cwd(), getRequiredOption("--extract"));
  const extraction = readJson(extractPath);
  const catalogue = readJsonIfExists(
    resolve(process.cwd(), "data/reference/source-catalogue/warhammer-community-warcry.discovered.json")
  );
  const sourceDocument = extraction.sourceDocument;
  const catalogueDocument = findCatalogueDocument(catalogue, sourceDocument.sourceUrl);
  const releaseDate = parseWarhammerDate(catalogueDocument?.lastUpdated) ?? new Date().toISOString().slice(0, 10);
  const language = sourceDocument.language;
  const sourceKey = sourceDocument.stableKey;
  const baseKey = sourceKey.replace(/-(en|de)$/, "");
  const titleKey = slugify(sourceDocument.title);
  const factionStableKey = `${titleKey}-${language}`;
  const grandAllianceName = guessGrandAlliance(extraction) ?? "Needs Review";
  const grandAllianceStableKey = `${slugify(grandAllianceName)}-${language}`;
  const outputPath = resolve(
    process.cwd(),
    getOptionValue("--out") ?? `data/reference/review/${sourceKey}.review.json`
  );

  const abilityDrafts = extraction.abilityCandidates
    .map((candidate, index) => toAbilityDraft(candidate, index, {
      baseKey,
      language,
      sourceKey,
      releaseStableKey: `${baseKey}-${language}`,
      factionStableKey
    }))
    .filter(Boolean);

  const draft = {
    kind: "warcry-herald-reference-review",
    schemaVersion: 1,
    reviewState: "needs-human-review",
    sourceWorkbench: relative(process.cwd(), extractPath).replaceAll("\\", "/"),
    sourceDocument: {
      stableKey: sourceKey,
      title: sourceDocument.title,
      publisher: sourceDocument.publisher,
      sourceUrl: sourceDocument.sourceUrl,
      language,
      publishedAt: releaseDate
    },
    release: {
      stableKey: `${baseKey}-${language}`,
      sourceDocumentStableKey: sourceKey,
      name: `${sourceDocument.title} (${language})`,
      releaseDate,
      language,
      status: "draft",
      sourceUrl: sourceDocument.sourceUrl
    },
    grandAlliance: {
      stableKey: grandAllianceStableKey,
      name: grandAllianceName,
      displayOrder: 0,
      approved: grandAllianceName !== "Needs Review"
    },
    faction: {
      stableKey: factionStableKey,
      rulesReleaseStableKey: `${baseKey}-${language}`,
      grandAllianceStableKey,
      name: sourceDocument.title,
      displayOrder: 0,
      approved: false,
      reviewNotes: "Confirm this source represents one faction before promotion. Compendium PDFs usually need manual split by faction."
    },
    runemarks: buildRunemarkDrafts(language, factionStableKey, sourceDocument.title),
    abilities: abilityDrafts,
    blessings: [],
    reviewChecklist: [
      "Open the local PDF and verify every row against the rendered source.",
      "Set reviewState to approved only after source document, release, faction, runemarks, and promoted rows are checked.",
      "Set approved=true only on rows that should be merged into data/reference.",
      "Replace empty effect values with short reviewed summaries, not copied full rules prose.",
      "Fill mechanics with machine-readable clauses for targets, ranges, durations, modifiers, caps, and exceptions."
    ]
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeJson(outputPath, draft);
  console.log(`ok - wrote ${outputPath}`);
  console.log(`ok - ability drafts=${abilityDrafts.length}`);
}

function promoteReviewDraft() {
  const reviewPath = resolve(process.cwd(), getRequiredOption("--review"));
  const referenceDir = resolve(process.cwd(), getOptionValue("--dir") ?? "data/reference");
  const review = readJson(reviewPath);

  if (review.reviewState !== "approved") {
    fail(`${reviewPath} has reviewState=${review.reviewState}; set it to approved before promotion.`);
  }

  const releases = readReferenceJson(referenceDir, "releases.json", {
    sourceDocuments: [],
    releases: []
  });
  const factions = readReferenceJson(referenceDir, "factions.json", {
    grandAlliances: [],
    factions: []
  });
  const runemarks = readReferenceJson(referenceDir, "runemarks.json", { runemarks: [] });
  const abilities = readReferenceJson(referenceDir, "abilities.json", {
    abilities: [],
    blessings: []
  });

  upsertByStableKey(releases.sourceDocuments, cleanApproved(review.sourceDocument));
  upsertByStableKey(releases.releases, cleanApproved(review.release));

  if (review.grandAlliance?.approved) {
    upsertByStableKey(factions.grandAlliances, cleanApproved(review.grandAlliance));
  }

  if (review.faction?.approved) {
    upsertByStableKey(factions.factions, cleanApproved(review.faction));
  }

  for (const runemark of review.runemarks ?? []) {
    if (runemark.approved) {
      upsertByStableKey(runemarks.runemarks, cleanApproved(runemark));
    }
  }

  for (const ability of review.abilities ?? []) {
    if (ability.approved) {
      upsertByStableKey(abilities.abilities, cleanApproved(ability));
    }
  }

  for (const blessing of review.blessings ?? []) {
    if (blessing.approved) {
      upsertByStableKey(abilities.blessings, cleanApproved(blessing));
    }
  }

  writeJson(resolve(referenceDir, "releases.json"), releases);
  writeJson(resolve(referenceDir, "factions.json"), factions);
  writeJson(resolve(referenceDir, "runemarks.json"), runemarks);
  writeJson(resolve(referenceDir, "abilities.json"), abilities);

  const result = spawnSync(
    process.execPath,
    [resolve(process.cwd(), "scripts/reference-data.mjs"), "validate", "--dir", referenceDir],
    { cwd: process.cwd(), encoding: "utf8" }
  );

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function toAbilityDraft(candidate, index, context) {
  const parsed = parseAbilityHeading(candidate.headingOrCostLine);

  if (!parsed) {
    return null;
  }

  const diceKey = getDiceKey(parsed.cost);
  const stableKey = `${context.baseKey}-${slugify(parsed.name)}-${context.language}`;

  return {
    stableKey,
    rulesReleaseStableKey: context.releaseStableKey,
    factionStableKey: context.factionStableKey,
    name: parsed.name,
    isUniversal: false,
    cost: parsed.cost,
    effect: "",
    mechanics: {
      cost: {
        dice: diceKey
      }
    },
    runemarkStableKeys: [
      `${diceKey}-${context.language}`,
      context.factionStableKey
    ],
    sourceDocumentStableKey: context.sourceKey,
    sourcePage: String(candidate.page),
    approved: false,
    reviewSource: {
      candidateIndex: index,
      page: candidate.page
    },
    reviewNotes: "Review the workbench candidate and rendered PDF before adding effect/mechanics."
  };
}

function parseAbilityHeading(value) {
  const match = value.match(/^\[(?<cost>[^\]]+)\]\s*(?<name>[^:]+):/);

  if (!match?.groups) {
    return null;
  }

  return {
    cost: match.groups.cost.trim(),
    name: match.groups.name.trim()
  };
}

function buildRunemarkDrafts(language, factionStableKey, factionName) {
  const diceNames =
    language === "de"
      ? [
          ["double", "Pasch"],
          ["triple", "Dreierpasch"],
          ["quad", "Viererpasch"]
        ]
      : [
          ["double", "Double"],
          ["triple", "Triple"],
          ["quad", "Quad"]
        ];

  return [
    ...diceNames.map(([key, name], index) => ({
      stableKey: `${key}-${language}`,
      name,
      category: "ability",
      displayOrder: 200 + index,
      approved: true
    })),
    {
      stableKey: factionStableKey,
      name: factionName,
      category: "faction",
      displayOrder: 100,
      approved: false
    }
  ];
}

function getDiceKey(value) {
  const normalized = slugify(value);

  if (normalized.includes("triple") || normalized.includes("dreier")) {
    return "triple";
  }

  if (normalized.includes("quad") || normalized.includes("vierer")) {
    return "quad";
  }

  return "double";
}

function guessGrandAlliance(extraction) {
  for (const page of extraction.pages ?? []) {
    for (const line of page.preview ?? []) {
      const match = line.match(/Grand Alliance\s+([A-Za-z]+)/i);

      if (match) {
        return match[1];
      }
    }
  }

  return null;
}

function findCatalogueDocument(catalogue, url) {
  for (const source of catalogue?.catalogues ?? []) {
    const document = source.documentLinks?.find((link) => link.url === url);

    if (document) {
      return document;
    }
  }

  return null;
}

function parseWarhammerDate(value) {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function readReferenceJson(referenceDir, fileName, fallback) {
  const path = resolve(referenceDir, fileName);
  return existsSync(path) ? readJson(path) : fallback;
}

function readJsonIfExists(path) {
  return existsSync(path) ? readJson(path) : null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function upsertByStableKey(items, item) {
  const index = items.findIndex((existing) => existing.stableKey === item.stableKey);

  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }
}

function cleanApproved(value) {
  const cleaned = { ...value };
  delete cleaned.approved;
  delete cleaned.reviewNotes;
  delete cleaned.reviewSource;
  return cleaned;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getRequiredOption(name) {
  const value = getOptionValue(name);

  if (!value) {
    fail(`${name} is required.`);
  }

  return value;
}

function getOptionValue(name) {
  const index = process.argv.indexOf(name);

  if (index < 0) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
