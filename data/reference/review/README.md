# Reviewed Reference Extraction

Use this directory for human-reviewed extraction notes before moving structured
records into the import files at `data/reference/`.

Recommended flow:

1. Run `pnpm discover:reference-sources`.
2. Review `data/reference/source-catalogue/warhammer-community-warcry.discovered.json`.
3. Copy each official PDF URL from the browser-visible download button and run
   `pnpm fetch:reference-pdf -- --url <pdf-url>`. Do not commit PDFs.
4. Run `pnpm extract:reference-pdf` to generate ignored workbench extraction
   files under `data/reference/workbench/`.
5. Review extraction candidates against the rendered PDF.
6. Extract structured facts into the import JSON files.
7. Keep source document, page, section, and language references for every row.

Do not paste whole rules documents or substantial copyrighted prose here.
