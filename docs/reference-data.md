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
