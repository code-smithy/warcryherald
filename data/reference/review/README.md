# Reviewed Reference Extraction

Use this directory for human-reviewed extraction notes before moving structured
records into the import files at `data/reference/`.

Recommended flow:

1. Run `pnpm discover:reference-sources`.
2. Review `data/reference/source-catalogue/warhammer-community-warcry.discovered.json`.
3. Download official PDFs manually for review. Do not commit PDFs.
4. Extract structured facts into the import JSON files.
5. Keep source document, page, section, and language references for every row.

Do not paste whole rules documents or substantial copyrighted prose here.
