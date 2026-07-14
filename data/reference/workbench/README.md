# Local Extraction Workbench

`pnpm sync:reference-pdfs` and `pnpm extract:reference-pdf` write generated
review artifacts here.

This directory is ignored by git because generated extraction files can contain
substantial text from copyrighted PDFs. Promote only reviewed structured facts
into the import files under `data/reference/`.
