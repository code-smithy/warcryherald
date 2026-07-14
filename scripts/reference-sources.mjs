import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const command = process.argv[2] ?? "discover";

if (command !== "discover") {
  console.error("Usage: node scripts/reference-sources.mjs discover [--manifest <path>] [--out <path>]");
  process.exit(1);
}

const manifestPath = resolve(
  process.cwd(),
  getOptionValue("--manifest") ?? "data/reference/sources/warhammer-community-warcry.json"
);
const outputPath = resolve(
  process.cwd(),
  getOptionValue("--out") ??
    "data/reference/source-catalogue/warhammer-community-warcry.discovered.json"
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const discoveredAt = new Date().toISOString();
const catalogues = [];

for (const catalogue of manifest.catalogues) {
  const response = await fetch(catalogue.url, {
    headers: {
      "User-Agent": "WarcryHeraldReferenceDiscovery/1.0"
    }
  });
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`${catalogue.url} failed with ${response.status}`);
  }

  const links = extractLinks(html, catalogue.url);
  const documentLinks = links.filter((link) => isLikelyReferenceDocument(link));

  catalogues.push({
    ...catalogue,
    discoveredAt,
    documentLinks,
    candidateLinks: links.filter((link) => link.url.includes("/downloads/") || link.url.includes("/warcry/"))
  });
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: discoveredAt,
      sourceManifest: manifestPath.replaceAll("\\", "/"),
      catalogues
    },
    null,
    2
  )}\n`
);

console.log(`ok - discovered ${catalogues.length} reference catalogues`);
console.log(`ok - wrote ${outputPath}`);

function extractLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html))) {
    const [, attributes, body] = match;
    const href = getAttribute(attributes, "href");

    if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
      continue;
    }

    const url = new URL(href, baseUrl).toString();
    const title = stripHtml(body).trim();
    const key = `${url}|${title}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push({ title, url });
  }

  for (const url of html.match(/https?:\/\/[^"'<> )]+/g) ?? []) {
    const normalizedUrl = url.replace(/\\u002F/g, "/");
    const key = `${normalizedUrl}|`;

    if (!seen.has(key)) {
      seen.add(key);
      links.push({ title: "", url: normalizedUrl });
    }
  }

  return links.sort((a, b) => a.url.localeCompare(b.url));
}

function isLikelyReferenceDocument(link) {
  const url = link.url.toLowerCase();
  const title = link.title.toLowerCase();

  return (
    (url.endsWith(".pdf") || url.includes(".pdf?")) &&
    (url.includes("warcry") || title.includes("warcry"))
  );
}

function getAttribute(attributes, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = attributes.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function stripHtml(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
}

function getOptionValue(name) {
  const index = process.argv.indexOf(name);

  if (index < 0) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}
