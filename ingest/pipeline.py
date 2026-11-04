"""Per-source pipeline: fetch → clean → extract → validate → diff → review queue or verify.

Every run writes one source_audit row. Nothing is auto-published: new programmes, validation
issues and any change to fees, deadlines or requirements go to review_queue; an unchanged
record only gets its last_verified_at refreshed.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Literal

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .ai import ModelRef
from .clean import pages_to_text
from .db import connect
from .diff import diff, project_extraction, project_stored
from .extract import extract_programme
from .fetch import FetchError, PoliteFetcher, RobotsDisallowed
from .validate import validate_record

log = logging.getLogger(__name__)

Status = Literal["verified", "queued_for_review", "broken", "skipped", "failed"]


@dataclass
class Source:
    urls: list[str]  # main programme page first, then fees / requirements pages
    target_title: str
    target_cycle: str  # e.g. "2027/28"
    programme_id: str | None = None  # known programme being re-verified


@dataclass
class RunResult:
    source: Source
    status: Status
    reasons: list[str] = field(default_factory=list)
    changes: dict[str, Any] = field(default_factory=dict)


def run_source(source: Source, fetcher: PoliteFetcher, *, model: ModelRef | None = None,
               today: dt.date | None = None) -> RunResult:
    today = today or dt.date.today()
    fetched_at = dt.datetime.now(dt.timezone.utc)

    try:
        pages = [(u, fetcher.fetch(u).html) for u in source.urls]
    except RobotsDisallowed as err:
        _audit(source, fetched_at, None, change=False, diff_={"skipped": "robots.txt disallows", "url": str(err)})
        return RunResult(source, "skipped", [f"robots.txt disallows {err}"])
    except FetchError as err:
        _audit(source, fetched_at, None, change=False, diff_={"broken": True, "error": str(err)})
        _queue(source, None, None, f"source_broken: {err}")
        log.error("ALERT broken source %s: %s", source.urls[0], err)
        return RunResult(source, "broken", [str(err)])

    content_hash = hashlib.sha256(pages_to_text(pages)[0].encode()).hexdigest()
    try:
        extraction = extract_programme(pages, target_title=source.target_title,
                                       target_cycle=source.target_cycle, model=model)
    except Exception as err:  # noqa: BLE001 - recorded, run continues with other sources
        _audit(source, fetched_at, content_hash, change=False, diff_={"extraction_error": str(err)})
        return RunResult(source, "failed", [f"extraction failed: {err}"])

    stored = _load_stored(source.programme_id) if source.programme_id else None
    outcome = validate_record(
        extraction.result.data,
        target_cycle=source.target_cycle,
        run_date=today,
        official_domains=stored["official_domains"] if stored else None,
        input_truncated=extraction.truncated,
    )
    uni = outcome.record.university
    if uni is not None and uni.city is None:  # pages often don't name the city; the university table does
        uni.city = stored["university_city"] if stored else _university_city(uni.official_domain)
    proposed = outcome.record.model_dump(mode="json")

    if outcome.broken_source:
        _audit(source, fetched_at, content_hash, change=False, diff_={"broken": True, "found": False})
        _queue(source, proposed, None, "source_broken: target programme not found on the pages")
        log.error("ALERT broken source %s: programme not found", source.urls[0])
        return RunResult(source, "broken", ["programme not found"])

    reasons = [f"{i.code}: {i.message}" for i in outcome.issues]
    changes: dict[str, Any] = {}
    if stored is None:
        reasons.append("new programme: not in the database yet")
    else:
        current = project_stored(stored["fees"], stored["intakes"], stored["requirement"])
        changes = diff(current, project_extraction(outcome.record))
        reasons += [f"changed: {k}" for k in changes]

    _audit(source, fetched_at, content_hash, change=bool(changes), diff_=changes or None)
    if reasons:
        _queue(source, proposed, stored["snapshot"] if stored else None, "; ".join(reasons))
        return RunResult(source, "queued_for_review", reasons, changes)

    _mark_verified(source.programme_id, fetched_at)
    return RunResult(source, "verified")


# --- database --------------------------------------------------------------------------

def _load_stored(programme_id: str) -> dict[str, Any] | None:
    with connect() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """select p.*, u.official_domains, u.city as university_city from public.programme p
               join public.university u on u.id = p.university_id where p.id = %s""",
            (programme_id,),
        )
        programme = cur.fetchone()
        if programme is None:
            return None
        cur.execute("select * from public.fee where programme_id = %s", (programme_id,))
        fees = cur.fetchall()
        cur.execute("select * from public.intake where programme_id = %s", (programme_id,))
        intakes = cur.fetchall()
        cur.execute("select * from public.requirement where programme_id = %s", (programme_id,))
        requirement = cur.fetchone()
    snapshot = json.loads(json.dumps({"programme": programme, "fees": fees, "intakes": intakes,
                                      "requirement": requirement}, default=str))
    return {"official_domains": programme["official_domains"], "university_city": programme["university_city"],
            "fees": fees, "intakes": intakes, "requirement": requirement, "snapshot": snapshot}


def _university_city(official_domain: str) -> str | None:
    """City of a known university matched by domain (new programmes have no stored record yet)."""
    with connect() as conn:
        row = conn.execute(
            "select city from public.university where %s = any(official_domains) and not is_demo limit 1",
            (official_domain.lower(),),
        ).fetchone()
    return row[0] if row else None


def _audit(source: Source, fetched_at: dt.datetime, content_hash: str | None, *, change: bool,
           diff_: dict | None) -> None:
    with connect() as conn:
        conn.execute(
            """insert into public.source_audit (table_name, record_id, source_url, fetched_at, content_hash,
                                                change_detected, diff)
               values ('programme', %s, %s, %s, %s, %s, %s)""",
            (source.programme_id, source.urls[0], fetched_at, content_hash, change,
             Jsonb(diff_) if diff_ is not None else None),
        )


def _queue(source: Source, proposed: dict | None, current: dict | None, reason: str) -> None:
    with connect() as conn:
        conn.execute(
            """insert into public.review_queue (table_name, record_id, proposed, current, reason)
               values ('programme', %s, %s, %s, %s)""",
            (source.programme_id,
             Jsonb(proposed or {"source_urls": source.urls, "target_title": source.target_title}),
             Jsonb(current) if current is not None else None, reason[:2000]),
        )


def _mark_verified(programme_id: str | None, at: dt.datetime) -> None:
    if programme_id is None:
        return
    with connect(autocommit=False) as conn:
        for table in ("programme", "requirement", "fee", "intake"):
            key = "id" if table == "programme" else "programme_id"
            conn.execute(f"update public.{table} set last_verified_at = %s where {key} = %s", (at, programme_id))
        conn.commit()

