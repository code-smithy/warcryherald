# Reference Review Notes

Use this directory for human-authored review notes before moving structured
records into the import files at `data/reference/`. Do not commit automated
website, PDF, or community-reference extraction output here.

Recommended flow:

1. Review source material outside the app repository.
2. Enter only the structured records needed by the app into `data/reference/*.json`.
3. Keep source document, page, section, and language references for every row.
4. Fill short reviewed `effect` summaries and structured `mechanics` where
   relevant.
5. Run `pnpm validate:reference-data`, then
   `pnpm import:reference-data -- --dry-run`.

Do not paste whole rules documents or substantial copyrighted prose here.
