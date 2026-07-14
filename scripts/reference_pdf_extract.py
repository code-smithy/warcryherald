import argparse
import hashlib
import json
import re
from pathlib import Path

try:
    from pypdf import PdfReader
except Exception as exc:
    raise SystemExit(
        "pypdf is required. Use the bundled Codex Python runtime or install pypdf."
    ) from exc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--source-key", required=True)
    parser.add_argument("--language", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--source-url")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    reader = PdfReader(str(pdf_path))
    pages = []
    fighter_candidates = []
    ability_candidates = []

    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        normalized_text = normalize_text(text)
        lines = [normalize_text(line) for line in text.splitlines()]
        lines = [line for line in lines if line]

        pages.append(
            {
                "page": index,
                "textHash": sha256(normalized_text),
                "lineCount": len(lines),
                "preview": lines[:12],
            }
        )

        fighter_candidates.extend(find_fighter_rows(index, lines))
        ability_candidates.extend(find_ability_blocks(index, lines))

    output = {
        "kind": "warcry-herald-reference-pdf-extraction",
        "schemaVersion": 1,
        "sourceDocument": {
            "stableKey": args.source_key,
            "title": args.title,
            "publisher": "Games Workshop",
            "sourceUrl": args.source_url,
            "language": args.language,
            "localPdf": str(pdf_path).replace("\\", "/"),
            "pageCount": len(reader.pages),
        },
        "reviewState": "needs-human-review",
        "copyrightNote": (
            "Generated extraction is for local review only. Do not commit full PDF text "
            "or substantial copied prose. Promote reviewed structured facts only."
        ),
        "pages": pages,
        "fighterCandidates": fighter_candidates,
        "abilityCandidates": ability_candidates,
        "reviewTodos": [
            "Confirm source document title, publication date, URL, and language.",
            "Map faction and grand alliance names.",
            "Review fighter candidates against the rendered PDF before importing.",
            "Convert ability text into short summaries plus structured mechanics.",
            "Record source page for every imported row.",
        ],
    }

    print(json.dumps(output, indent=2, ensure_ascii=False))


def find_fighter_rows(page, lines):
    candidates = []

    for line in lines:
        tokens = line.split()
        numbers = [int(value) for value in re.findall(r"\b\d+\b", line)]

        if len(numbers) < 5:
            continue

        # Warcry fighter rows usually expose movement, toughness, wounds, points,
        # and one or more weapon characteristics. This is intentionally loose:
        # human review owns final correctness.
        if not any(value >= 30 for value in numbers):
            continue

        candidates.append(
            {
                "page": page,
                "rawLine": line,
                "numbers": numbers,
                "nameGuess": guess_name(tokens),
                "reviewStatus": "needs-human-review",
            }
        )

    return candidates


def find_ability_blocks(page, lines):
    candidates = []
    dice_terms = {
        "double",
        "triple",
        "quad",
        "pasch",
        "dreierpasch",
        "viererpasch",
    }

    for index, line in enumerate(lines):
        lower = line.lower()

        if not any(term in lower for term in dice_terms):
            continue

        context = lines[index : index + 4]
        candidates.append(
            {
                "page": page,
                "headingOrCostLine": line,
                "contextPreview": context,
                "reviewStatus": "needs-human-review",
            }
        )

    return candidates


def guess_name(tokens):
    words = []

    for token in tokens:
        if re.search(r"\d", token):
            break

        words.append(token)

    return " ".join(words).strip()


def normalize_text(value):
    return re.sub(r"\s+", " ", value).strip()


def sha256(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


if __name__ == "__main__":
    main()
