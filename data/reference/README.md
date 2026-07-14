# Reference Data Inputs

Phase 3 imports reviewed, versioned JSON from this directory. These files are
intentionally empty until a source release and attribution format are selected.

Do not scrape websites at runtime, run automated internet collection, or commit
generated extraction output. Add only human-reviewed structured data that fits
the copyright boundary in `docs/reference-data.md`.

Reference data should be entered through deliberate manual review into the JSON
files in this directory, then checked with `pnpm validate:reference-data`.

See `examples/en-de/` for a fictional English and German dataset that validates
against the importer schema. The current Phase 3 model stores each language as
its own release slice, so stable keys include a language suffix such as `en` or
`de`. Future languages should use the same pattern until dedicated translation
tables are added.
