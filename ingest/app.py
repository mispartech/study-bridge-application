"""Ingestion service: FastAPI endpoints plus a weekly re-verification schedule.

  uv run --project ingest uvicorn ingest.app:app --port 8100

POST /runs takes one source and runs the pipeline; requests need `Authorization: Bearer
$INGEST_API_TOKEN`. The scheduler re-verifies every non-demo programme weekly.
"""

from __future__ import annotations

import datetime as dt
import hmac
import logging
import os
from contextlib import asynccontextmanager
from typing import Annotated

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import Depends, FastAPI, Header, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from .db import connect
from .env import load_env
from .fetch import PoliteFetcher
from .pipeline import RunResult, Source, run_source
from .validate import cycle_of

log = logging.getLogger("ingest")
load_env()


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    expected = os.environ.get("INGEST_API_TOKEN")
    if not expected:
        raise HTTPException(503, "INGEST_API_TOKEN is not configured")
    if not authorization or not hmac.compare_digest(authorization, f"Bearer {expected}"):
        raise HTTPException(401, "Invalid token")


class SourceIn(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=5)
    target_title: str = Field(min_length=3)
    target_cycle: str = Field(pattern=r"^20[2-3]\d/\d{2}$", examples=["2027/28"])
    programme_id: str | None = None


class RunOut(BaseModel):
    status: str
    reasons: list[str]
    changes: dict


def reverify_all() -> list[RunResult]:
    """Weekly job: re-check every real (non-demo) programme against its source page."""
    with connect() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """select p.id, p.title, p.source_url, min(i.start_month) as first_start
               from public.programme p left join public.intake i on i.programme_id = p.id
               where not p.is_demo group by p.id order by p.last_verified_at"""
        )
        rows = cur.fetchall()
    fetcher = PoliteFetcher()
    results = []
    try:
        for r in rows:
            start = r["first_start"]
            today = dt.date.today()
            cycle = cycle_of(start.year, start.month) if start else cycle_of(today.year + 1, today.month)
            source = Source([r["source_url"]], r["title"], cycle, str(r["id"]))
            result = run_source(source, fetcher)
            log.info("%s %s %s", result.status, r["title"], "; ".join(result.reasons))
            results.append(result)
    finally:
        fetcher.close()
    return results


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler = BackgroundScheduler(timezone="Africa/Lagos")
    if os.environ.get("INGEST_SCHEDULE", "on") != "off":
        scheduler.add_job(reverify_all, "cron", day_of_week="sun", hour=2, id="reverify_all",
                          max_instances=1, coalesce=True)
        scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title="StudyBridge ingestion", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/runs", response_model=RunOut, dependencies=[Depends(require_token)])
def create_run(body: SourceIn) -> RunOut:
    fetcher = PoliteFetcher()
    try:
        result = run_source(Source(**body.model_dump()), fetcher)
    finally:
        fetcher.close()
    return RunOut(status=result.status, reasons=result.reasons, changes=result.changes)
