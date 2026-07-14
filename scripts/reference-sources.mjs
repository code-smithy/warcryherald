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
  const documentLinks = mergeDocumentLinks(
    links.filter((link) => isLikelyReferenceDocument(link)),
    await fetchWarhammerCommunityDownloads(catalogue)
  );

  catalogues.push({
    ...catalogue,
    documentLinks,
    candidateLinks: links.filter((link) => link.url.includes("/downloads/") || link.url.includes("/warcry/"))
  });
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      sourceManifest: getRepoRelativePath(manifestPath),
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

    const url = normalizeDiscoveredUrl(new URL(href, baseUrl).toString());
    const title = stripHtml(body).trim();
    const key = `${url}|${title}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push({ title, url });
  }

  for (const url of html.match(/https?:\/\/[^"'<> )]+/g) ?? []) {
    const normalizedUrl = normalizeDiscoveredUrl(url.replace(/\\u002F/g, "/"));
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

async function fetchWarhammerCommunityDownloads(catalogue) {
  const language = getWarhammerCommunityLanguage(catalogue.language);

  if (!catalogue.url.includes("warhammer-community.com") || !language) {
    return [];
  }

  const response = await fetch("https://www.warhammer-community.com/api/search/downloads/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "WarcryHeraldReferenceDiscovery/1.0"
    },
    body: JSON.stringify({
      index: "downloads_v2",
      searchTerm: "",
      gameSystem: "warcry",
      language
    })
  });

  if (!response.ok) {
    throw new Error(`Warhammer Community downloads API failed with ${response.status}`);
  }

  const payload = await response.json();

  return (payload.hits ?? [])
    .map((hit) => hit.id ?? hit)
    .filter((download) => download.file)
    .map((download) => ({
      title: download.title,
      url: `https://assets.warhammer-community.com/${download.file}`,
      sourceApi: "https://www.warhammer-community.com/api/search/downloads/",
      slug: download.slug,
      file: download.file,
      fileSize: download.file_size,
      lastUpdated: download.last_updated,
      categories: (download.download_categories ?? []).map((category) =>
        typeof category === "string" ? category : category.slug
      )
    }));
}

function getWarhammerCommunityLanguage(language) {
  return {
    de: "german",
    en: "english"
  }[language];
}

function mergeDocumentLinks(...groups) {
  const merged = [];
  const seen = new Set();

  for (const group of groups) {
    for (const link of group) {
      if (seen.has(link.url)) {
        continue;
      }

      seen.add(link.url);
      merged.push(link);
    }
  }

  return merged.sort((a, b) => {
    const titleOrder = (a.title ?? "").localeCompare(b.title ?? "");
    return titleOrder || a.url.localeCompare(b.url);
  });
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

function normalizeDiscoveredUrl(value) {
  return value.replace(/\\+$/g, "");
}

function getOptionValue(name) {
  const index = process.argv.indexOf(name);

  if (index < 0) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function getRepoRelativePath(path) {
  const relativePath = path
    .replace(resolve(process.cwd()), "")
    .replace(/^[/\\]/, "")
    .replaceAll("\\", "/");

  return relativePath || path.replaceAll("\\", "/");
}
