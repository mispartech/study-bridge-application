"""Logs every model call to public.ai_usage. Never raises: logging must not break a run."""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from . import ModelRef

log = logging.getLogger(__name__)


def log_usage(
    *,
    task: str,
    ref: "ModelRef",
    input_tokens: int | None,
    output_tokens: int | None,
    latency_ms: int,
    success: bool,
    error: str | None = None,
    user_id: str | None = None,
) -> None:
    if os.environ.get("AI_USAGE_LOGGING") == "off":  # unit tests
        return
    try:
        from ..db import connect

        with connect() as conn:
            conn.execute(
                """insert into public.ai_usage
                   (task, provider, model, input_tokens, output_tokens, latency_ms, success, error, user_id)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (task, ref.provider, ref.model, input_tokens, output_tokens, max(0, latency_ms), success,
                 (error or None) and error[:1000], user_id),
            )
    except Exception as err:  # noqa: BLE001 - logging is best effort
        log.warning("ai_usage logging failed: %s", err)
