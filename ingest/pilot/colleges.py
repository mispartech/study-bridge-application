"""Step C college run: graduate certificates from colleges.json, on the configured extraction model.

  uv run --project ingest python -m ingest.pilot.colleges                                   # configured model
  uv run --project ingest python -m ingest.pilot.colleges --model google:gemini-3.6-flash   # this run only

Every record goes to the review queue (nothing is published). Institution facts the pages can't give (region,
public, college) come from colleges.json and are merged into each queued record for the reviewer to check, the
same way as the Master's pilot. A rerun skips programmes already queued or approved.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import sys
from pathlib import Path

from ..ai import ModelRef

from ..env import load_env
from ..fetch import PoliteFetcher
from ..pipeline import Source, run_source
from .run import already_queued, attach_facts, university_facts

HERE = Path(__file__).parent
log = logging.getLogger("colleges")


def main() -> None:
    load_env()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    config = json.loads((HERE / "colleges.json").read_text(encoding="utf-8"))
    fetcher = PoliteFetcher()
    model = None
    if "--model" in sys.argv:
        provider, name = sys.argv[sys.argv.index("--model") + 1].split(":", 1)
        model = ModelRef(provider, name)
        log.info("model for this run: %s:%s", provider, name)
    done = already_queued()
    summary = []
    for item in config["programmes"]:
        if set(item["urls"]) & done:
            log.info("skipped | %s | already in the review queue", item["target_title"])
            continue
        source = Source(urls=item["urls"], target_title=item["target_title"], target_cycle=config["cycle"])
        try:
            # Without --model, the configured extraction model (Settings, then config/ai.json) is used.
            result = run_source(source, fetcher, model=model, always_review=True)
        except Exception as err:  # noqa: BLE001 - one bad page must not stop the run
            log.info("failed | %s | %s", item["target_title"], str(err)[:160])
            summary.append({"target_title": item["target_title"], "domain": item["domain"], "status": "failed",
                            "review_id": None, "reasons": [str(err)[:300]]})
            continue
        if result.review_id:
            attach_facts(result.review_id, university_facts(config, item["domain"]), item["field"])
        log.info("%s | %s | %s", result.status, item["target_title"], "; ".join(result.reasons)[:200])
        summary.append({"target_title": item["target_title"], "domain": item["domain"], "status": result.status,
                        "review_id": result.review_id, "reasons": result.reasons})
    stamp = dt.date.today().isoformat()
    (HERE / f"colleges-run-{stamp}.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for row in summary:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    log.info("Done: %s", counts)


if __name__ == "__main__":
    main()
