"""City costs from a university's own accommodation and cost-of-living pages, sent to the review queue.

Nothing is published here: a reviewer approves each record in /admin, where the figures become monthly
city_cost rows.
"""

from __future__ import annotations

import json
from pathlib import Path

from psycopg.types.json import Jsonb

from .ai import ModelRef, generate_structured, load_prompt
from .clean import pages_to_text
from .db import connect
from .fetch import PoliteFetcher

SCHEMA = json.loads((Path(__file__).parents[1] / "schemas" / "record_city_costs.schema.json").read_text("utf-8"))
SOURCE_TEXT_LIMIT = 60_000


def queue_city_costs(fetcher: PoliteFetcher, *, urls: list[str], university: dict, cycle: str,
                     model: ModelRef | None = None) -> str:
    """Extracts one university's costs and queues them. Returns the review_queue id."""
    pages = [(url, fetcher.fetch(url).html) for url in urls]
    page_text, _ = pages_to_text(pages)
    prompt = load_prompt("r4_city_costs", {
        "university": university["name"], "city": university["city"], "target_cycle": cycle, "page_text": page_text,
    })
    result = generate_structured("extraction", prompt, SCHEMA, tool_name="record_city_costs",
                                 tool_description="Record the accommodation and living costs from the pages.",
                                 model=model)
    proposed = {
        **result.data,
        "university": {"name": university["name"], "official_domain": university["official_domain"]},
        "country": university["country"],
        "city": university["city"],
        "source_urls": urls,
    }
    reasons = ["pilot: every record is reviewed"]
    if result.data.get("missing_fields"):
        reasons.append("missing: " + ", ".join(result.data["missing_fields"])[:300])
    with connect() as conn:
        row = conn.execute(
            """insert into public.review_queue (table_name, proposed, reason, source_text)
               values ('city_cost', %s, %s, %s) returning id""",
            (Jsonb(proposed), "; ".join(reasons), page_text[:SOURCE_TEXT_LIMIT]),
        ).fetchone()
    return str(row[0])
