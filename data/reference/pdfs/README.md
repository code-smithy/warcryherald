# Local PDF Inbox

`pnpm sync:reference-pdfs` downloads official Warhammer Community PDFs into this
directory before running extraction.

Preferred command:

```bash
pnpm discover:reference-sources
pnpm sync:reference-pdfs
```

Single-PDF command:

```bash
pnpm fetch:reference-pdf -- --url "https://www.warhammer-community.com/..."
```

PDF files in this directory are ignored by git and must not be committed.
