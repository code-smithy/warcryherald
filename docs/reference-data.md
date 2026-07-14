# Reference Data

Reference data stores structured rules information needed by roster, battle, and
aftermath workflows.

## Rules Releases

Every reference record belongs to a rules release. When official points,
profiles, abilities, or clarifications change, create new records for the new
release and retire old records instead of overwriting them.

Suggested rules release fields:

- `id`
- `name`
- `release_date`
- `language`
- `status`
- `source_url`
- `imported_at`

## Import Principles

The import pipeline should be deterministic and idempotent.

It must:

- Validate input with Zod.
- Produce stable identifiers.
- Reject duplicate stable keys.
- Reject invalid faction references.
- Reject invalid runemark references.
- Detect impossible statistics.
- Produce a summary of inserted, updated, and retired records.
- Support dry-run mode.
- Avoid runtime scraping.

## Source-To-Import Pipeline

The Phase 3 pipeline separates human review and database import. Automated
internet collection, website scraping, PDF downloading, and generated extraction
workbench files are intentionally out of scope.

1. Review source material outside the app repository.
2. Enter only reviewed structured records into the import files under
   `data/reference/`.
3. Preserve source title, page or section, URL where appropriate, release date,
   and language for every imported row.
4. Run `pnpm validate:reference-data` to check relationships and statistics.
5. Run `pnpm import:reference-data -- --dry-run` to check the import without
   remote writes.
6. Use the GitHub **Reference Data Import** workflow only after a successful dry
   run and human review of the JSON input files.

## Phase 3 Import Files

Reviewed input lives under `data/reference/`:

- `releases.json` contains `sourceDocuments` and `releases`.
- `factions.json` contains `grandAlliances` and `factions`.
- `runemarks.json` contains `runemarks`.
- `fighters.json` contains `fighters`.
- `weapons.json` contains `weapons`.
- `abilities.json` contains `abilities` and `blessings`.

Run `pnpm validate:reference-data` before import. The validator rejects
duplicate stable keys, invalid release/faction/runemark references, and
impossible fighter or weapon statistics. Run
`pnpm import:reference-data -- --dry-run` to check the same files without
remote writes.

Actual imports require `SUPABASE_SERVICE_ROLE_KEY` in the process environment.
Do not place the service-role key in `.env` files that can be used by the
frontend, and never prefix it with `VITE_`.

## Multilingual Data

Phase 3 supports multiple languages by treating each language as its own source
document and rules release. Until dedicated translation tables are added, stable
keys should include the release year and language code so records do not
collide:

- English example: `sample-storm-vanguard-captain-2026-en`
- German example: `sample-sturm-vorhut-hauptmann-2026-de`

Use ISO-style language tags such as `en`, `de`, `fr`, `es`, `it`, `ja`, or
`ko`. The public reference browser currently shows all imported languages
together; a language filter can be added once real multilingual data exists.

Fictional English and German example files live in
`data/reference/examples/en-de/`. Validate that example set with:

```bash
pnpm validate:reference-data -- --dir data/reference/examples/en-de
```

## Structured Mechanics

Ability and blessing rows have both an `effect` string and a `mechanics` object.
Use `effect` for a short reviewed human-readable summary. Use `mechanics` for
unambiguous machine-readable clauses such as targets, distances, visibility,
durations, caps, dice costs, and characteristic modifiers.

Example:

```json
{
  "effect": "Short reviewed summary of the ability effect.",
  "mechanics": {
    "cost": { "dice": "triple" },
    "target": {
      "side": "friendly",
      "count": 1,
      "visibilityRequired": true,
      "maximumDistanceInches": 6
    },
    "duration": "end-of-battle-round",
    "modifiers": [
      {
        "characteristic": "attacks",
        "weaponType": "melee",
        "operation": "add",
        "value": 1
      }
    ]
  }
}
```

## Copyright Boundary

Do not copy publication layouts, artwork, logos, or images into Warcry Herald.

Rules text, table descriptions, names, structured effects, and explanatory text
may be relevant product data for campaign workflows. They should still be
imported deliberately rather than indiscriminately:

- Prefer structured representations for rules logic and table outcomes.
- Preserve source attribution and language.
- Avoid duplicating whole publication presentation or decorative layout.
- Keep imported text limited to what is necessary for the feature using it.
- Flag any uncertain copying boundary in `docs/project-tracker.md` before
  implementing the import.

The app may store structured statistics, names, identifiers, point costs,
runemark relationships, source names, source pages, source links, and short
structured effects when justified. Prefer user-supplied or original artwork.
