import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

const command = process.argv[2] ?? "extract";

if (command === "fetch") {
  await fetchPdf();
} else if (command === "extract") {
  extractPdf();
} else if (command === "sync") {
  await syncCataloguePdfs();
} else {
  fail(
    "Usage: node scripts/reference-pdf.mjs fetch --url <pdf-url> [--out <path>] | extract --pdf <path> --source-key <key> --language <code> [--title <title>] [--source-url <url>] [--out <path>] | sync [--catalogue <path>] [--language <code>] [--limit <count>] [--force]"
  );
}

async function fetchPdf() {
  const url = getRequiredOption("--url");
  const outputPath = getOptionValue("--out");

  await fetchPdfFile(url, outputPath);
}

async function fetchPdfFile(url, outputPathValue) {
  const parsedUrl = new URL(url);
  const urlName = basename(parsedUrl.pathname) || "reference.pdf";
  const outputPath = resolve(
    process.cwd(),
    outputPathValue ?? `data/reference/pdfs/${sanitizeFileName(urlName)}`
  );

  if (!outputPath.toLowerCase().endsWith(".pdf")) {
    fail("--out must end with .pdf.");
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "WarcryHeraldReferencePipeline/1.0"
    }
  });

  if (!response.ok) {
    fail(`${url} failed with ${response.status}.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (!isPdf(bytes)) {
    fail(`${url} did not return a PDF.`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, bytes);

  console.log(`ok - fetched ${url}`);
  console.log(`ok - wrote ${outputPath}`);

  return outputPath;
}

function extractPdf() {
  const pdfPath = getRequiredOption("--pdf");
  const sourceKey = getRequiredOption("--source-key");
  const language = getRequiredOption("--language");
  const title = getOptionValue("--title") ?? basename(pdfPath, ".pdf");
  const sourceUrl = getOptionValue("--source-url") ?? null;
  const outputPath = resolve(
    process.cwd(),
    getOptionValue("--out") ?? `data/reference/workbench/${sourceKey}.extracted.json`
  );

  if (!/^[a-z0-9][a-z0-9-]*$/.test(sourceKey)) {
    fail("--source-key must use lowercase letters, numbers, and hyphens.");
  }

  if (!existsSync(resolve(process.cwd(), pdfPath))) {
    fail(`PDF not found: ${pdfPath}`);
  }

  const python = getPythonExecutable();
  const result = spawnSync(
    python,
    [
      resolve(process.cwd(), "scripts", "reference_pdf_extract.py"),
      "--pdf",
      resolve(process.cwd(), pdfPath),
      "--source-key",
      sourceKey,
      "--language",
      language,
      "--title",
      title,
      ...(sourceUrl ? ["--source-url", sourceUrl] : [])
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8"
      }
    }
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    process.exit(result.status ?? 1);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, result.stdout);

  console.log(`ok - extracted ${pdfPath}`);
  console.log(`ok - wrote ${outputPath}`);

  return outputPath;
}

async function syncCataloguePdfs() {
  const cataloguePath = resolve(
    process.cwd(),
    getOptionValue("--catalogue") ??
      "data/reference/source-catalogue/warhammer-community-warcry.discovered.json"
  );
  const languageFilter = getOptionValue("--language");
  const limit = Number.parseInt(getOptionValue("--limit") ?? "", 10);
  const force = process.argv.includes("--force");
  const catalogue = JSON.parse(readFileSync(cataloguePath, "utf8").replace(/^\uFEFF/, ""));
  const downloads = [];

  for (const source of catalogue.catalogues ?? []) {
    if (languageFilter && source.language !== languageFilter) {
      continue;
    }

    for (const document of source.documentLinks ?? []) {
      downloads.push({
        source,
        document
      });
    }
  }

  const selectedDownloads = Number.isFinite(limit) ? downloads.slice(0, limit) : downloads;

  if (selectedDownloads.length === 0) {
    fail(`No document links found in ${cataloguePath}`);
  }

  const usedSourceKeys = new Set();

  for (const { source, document } of selectedDownloads) {
    const pdfPath = resolve(
      process.cwd(),
      "data/reference/pdfs",
      source.language,
      sanitizeFileName(document.file ?? basename(new URL(document.url).pathname))
    );
    const sourceKey = getUniqueSourceKey(
      usedSourceKeys,
      `${document.slug ?? basename(pdfPath, ".pdf")}-${source.language}`
    );

    if (!existsSync(pdfPath) || force) {
      await fetchPdfFile(document.url, pdfPath);
    } else {
      console.log(`ok - using existing ${pdfPath}`);
    }

    extractPdfFromOptions({
      pdfPath,
      sourceKey,
      language: source.language,
      title: document.title ?? basename(pdfPath, ".pdf"),
      sourceUrl: document.url,
      outputPath: resolve(process.cwd(), "data/reference/workbench", `${sourceKey}.extracted.json`)
    });
  }

  console.log(`ok - synced ${selectedDownloads.length} reference PDFs`);
}

function getPythonExecutable() {
  const configured = process.env.PYTHON;

  if (configured) {
    return configured;
  }

  return process.platform === "win32" ? "python" : "python3";
}

function getRequiredOption(name) {
  const value = getOptionValue(name);

  if (!value) {
    fail(`${name} is required.`);
  }

  return value;
}

function getOptionValue(name) {
  const index = process.argv.indexOf(name);

  if (index < 0) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function sanitizeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function extractPdfFromOptions({ pdfPath, sourceKey, language, title, sourceUrl, outputPath }) {
  const previousArgv = process.argv;

  process.argv = [
    previousArgv[0],
    previousArgv[1],
    "extract",
    "--pdf",
    relative(process.cwd(), pdfPath),
    "--source-key",
    sourceKey,
    "--language",
    language,
    "--title",
    title,
    "--source-url",
    sourceUrl,
    "--out",
    outputPath
  ];

  try {
    extractPdf();
  } finally {
    process.argv = previousArgv;
  }
}

function getUniqueSourceKey(used, value) {
  const base = slugify(value);
  let sourceKey = base;
  let index = 2;

  while (used.has(sourceKey)) {
    sourceKey = `${base}-${index}`;
    index += 1;
  }

  used.add(sourceKey);
  return sourceKey;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function isPdf(bytes) {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
