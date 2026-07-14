# Reviewed Reference Extraction

Use this directory for human-reviewed extraction notes before moving structured
records into the import files at `data/reference/`.

Recommended flow:

1. Run `pnpm discover:reference-sources`.
2. Review `data/reference/source-catalogue/warhammer-community-warcry.discovered.json`.
3. Run `pnpm sync:reference-pdfs` to download official PDFs and generate ignored
   workbench extraction files under `data/reference/workbench/`.
4. Create a review draft from one workbench file:

   ```bash
   pnpm draft:reference-review -- --extract data/reference/workbench/helsmiths-of-hashut-en.extracted.json
   ```

5. Review the draft against the rendered PDF. Set `approved: true` only on rows
   that should be imported, fill short reviewed `effect` summaries, fill
   structured `mechanics`, and set the draft `reviewState` to `approved`.
6. Promote the approved draft into import JSON:

   ```bash
   pnpm promote:reference-review -- --review data/reference/review/helsmiths-of-hashut-en.review.json
   ```

7. Run `pnpm validate:reference-data`, then the dry-run/import workflow.
8. Keep source document, page, section, and language references for every row.

Do not paste whole rules documents or substantial copyrighted prose here.
