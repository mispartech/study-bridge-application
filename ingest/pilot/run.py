"""Pilot extraction: 40 programmes, once, on Gemini Flash. Every record goes to the review queue.

  uv run --project ingest python -m ingest.pilot.run           # programmes and city costs
  uv run --project ingest python -m ingest.pilot.run costs     # city costs only

The configured extraction model (config/ai.json) is not changed: this run passes its own model. University
facts the pages can't give (region, public, licence register) come from sources.json and are merged into each
queued record for the reviewer to check.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import sys
from pathlib import Path

from psycopg.types.json import Jsonb

from ..ai import ModelRef
from ..db import connect
from ..env import load_env
from ..fetch import PoliteFetcher
from ..city_costs import queue_city_costs
from ..pipeline import Source, run_source

PILOT_MODEL = ModelRef("google", "gemini-3.6-flash")
HERE = Path(__file__).parent

log = logging.getLogger("pilot")


def university_facts(config: dict, domain: str) -> dict:
    facts = dict(config["universities"][domain])
    return {
        **facts,
        "official_domain": domain,
        "register_url": config["registers"][facts["country"]],
        "intl_office_url": None,  # the reviewer adds this from the university's own site
    }


def attach_facts(review_id: str, facts: dict, pilot_field: str) -> None:
    with connect() as conn:
        conn.execute(
            """update public.review_queue
               set proposed = jsonb_set(proposed, '{university}', coalesce(proposed->'university', '{}'::jsonb) || %s),
                   reason = reason || %s
               where id = %s""",
            (Jsonb(facts), f"; pilot field: {pilot_field}", review_id),
        )


def run_city_costs(config: dict, fetcher: PoliteFetcher) -> list[dict]:
    summary = []
    for domain, urls in config["cost_pages"].items():
        university = {**config["universities"][domain], "official_domain": domain}
        try:
            review_id = queue_city_costs(fetcher, urls=urls, university=university, cycle=config["cycle"],
                                         model=PILOT_MODEL)
            status = "queued_for_review"
        except Exception as err:  # noqa: BLE001 - recorded, the run goes on
            review_id, status = None, f"failed: {err}"[:300]
        log.info("%s | costs | %s", status, domain)
        summary.append({"domain": domain, "status": status, "review_id": review_id})
    return summary


def main() -> None:
    load_env()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    config = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    fetcher = PoliteFetcher()
    part = sys.argv[1] if len(sys.argv) > 1 else "all"
    if part in ("all", "costs"):
        costs = run_city_costs(config, fetcher)
        (HERE / f"costs-{dt.date.today().isoformat()}.json").write_text(json.dumps(costs, indent=2) + "\n",
                                                                         encoding="utf-8")
        if part == "costs":
            return
    summary = []
    for item in config["programmes"]:
        source = Source(urls=item["urls"], target_title=item["target_title"], target_cycle=config["cycle"])
        result = run_source(source, fetcher, model=PILOT_MODEL, always_review=True)
        if result.review_id:
            attach_facts(result.review_id, university_facts(config, item["domain"]), item["field"])
        log.info("%s | %s | %s", result.status, item["target_title"], "; ".join(result.reasons)[:160])
        summary.append({"target_title": item["target_title"], "domain": item["domain"], "field": item["field"],
                        "status": result.status, "review_id": result.review_id, "reasons": result.reasons})
    stamp = dt.date.today().isoformat()
    (HERE / f"run-{stamp}.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for row in summary:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    log.info("Done: %s", counts)


if __name__ == "__main__":
    main()
