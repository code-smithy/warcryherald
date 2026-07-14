import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const command = process.argv[2] ?? "extract";

if (command !== "extract") {
  fail("Usage: node scripts/reference-pdf.mjs extract --pdf <path> --source-key <key> --language <code> [--title <title>] [--source-url <url>] [--out <path>]");
}

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
    encoding: "utf8"
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
