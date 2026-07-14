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

The Phase 3 pipeline separates source discovery, human review, and database
import:

1. `data/reference/sources/warhammer-community-warcry.json` records the official
   English and German Warhammer Community catalogue URLs.
2. `pnpm discover:reference-sources` fetches those catalogue pages and writes
   discovered source metadata to
   `data/reference/source-catalogue/warhammer-community-warcry.discovered.json`.
   This generated file is ignored by git because it includes timestamps and may
   change whenever Warhammer Community changes its page rendering.
3. Reviewers download official PDFs manually from the catalogue into
   `data/reference/pdfs/`. PDFs are ignored by git and must not be committed.
4. Run `pnpm extract:reference-pdf` for each downloaded PDF to create an ignored
   workbench extraction file under `data/reference/workbench/`.
5. Reviewers convert extraction candidates into structured facts under
   `data/reference/review/` or directly into the import files. Do not commit
   substantial copied prose.
6. Reviewed structured records are entered into the import files under
   `data/reference/`.
7. `pnpm validate:reference-data` checks relationships and statistics.
8. `pnpm import:reference-data -- --dry-run` checks the import without writes.
9. The GitHub **Reference Data Import** workflow imports reviewed data after a
   successful dry run.

Warcrier and community JSON can be used for completeness checks, but official
Warhammer Community PDFs remain the provenance recorded in `sourceDocuments`.
If the official page renders PDF links dynamically and discovery finds only
catalogue links, use the browser-visible download buttons to identify the PDFs
for review.

PDF extraction command:

```bash
pnpm extract:reference-pdf -- \
  --pdf data/reference/pdfs/example.pdf \
  --source-key warcry-example-2026-en \
  --language en \
  --title "Warcry Example 2026" \
  --source-url "https://www.warhammer-community.com/..."
```

The extractor writes page hashes, previews, likely fighter rows, and likely
ability blocks to `data/reference/workbench/<source-key>.extracted.json`.
Those generated files are ignored by git because they can contain substantial
source text. Treat them as review aids, not import-ready data.

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

## Official Source Discovery

The official Warhammer Community Warcry downloads page should be treated as the
primary discovery location for current public Warcry PDFs:

- `https://www.warhammer-community.com/de-de/downloads/warcry/`

The page exposes localized Warhammer Community content in multiple languages,
including UK English, German, Spanish, French, Italian, Japanese, and Korean.
Reference-data work should account for language-specific PDFs and record the
source language on imported rules releases or source documents.

Use the official PDFs as source material for structured data extraction and
verification, but do not scrape the site at runtime. Imports should use reviewed,
versioned input files committed to the project only when their content fits the
copyright boundary below.

## Community Rules Reference

Warcrier is an available community reference for Warcry rules text, tables, and
rules navigation:

- `https://warcrier.net/docs/rules`

Warcrier presents rules sections such as battle setup, fighter profiles,
movement, attacks, abilities, reactions, terrain, objectives, runemarks,
designers' commentary, optional rules, and warband data. It identifies itself as
a free community project not associated with Games Workshop.

Use Warcrier as a cross-checking and discovery source when extracting rules
structure, table names, terminology, and relationships. Do not treat it as the
authoritative source over official PDFs when there is a conflict; record the
official source document, page or section, language, and release wherever
possible.

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
