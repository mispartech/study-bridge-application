"""Saves the golden-set pages listed in manifest.json to golden/pages/<slug>__<n>.html.

  uv run --project ingest python -m ingest.golden.fetch [--force]

Uses the polite fetcher (robots.txt, 5 s per site, User-Agent with INGEST_CONTACT_EMAIL).
Already-saved pages are skipped unless --force.
"""

from __future__ import annotations

import argparse
import json
import sys

from ..fetch import FetchError, PoliteFetcher, RobotsDisallowed
from .run import GOLDEN


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args(argv)

    manifest = json.loads((GOLDEN / "manifest.json").read_text(encoding="utf-8"))
    pages_dir = GOLDEN / "pages"
    pages_dir.mkdir(exist_ok=True)
    fetcher = PoliteFetcher()
    failures = 0
    try:
        for case in manifest["cases"]:
            for i, url in enumerate(case["urls"]):
                out = pages_dir / f"{case['slug']}__{i}.html"
                if out.exists() and not args.force:
                    continue
                try:
                    page = fetcher.fetch(url)
                except (RobotsDisallowed, FetchError) as err:
                    failures += 1
                    print(f"FAIL {case['slug']} {url}: {type(err).__name__} {err}", file=sys.stderr)
                    continue
                out.write_text(f"<!-- source: {page.final_url} | rendered: {page.rendered} -->\n{page.html}",
                               encoding="utf-8")
                print(f"saved {out.name} ({len(page.html):,} bytes{', rendered' if page.rendered else ''})")
    finally:
        fetcher.close()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
