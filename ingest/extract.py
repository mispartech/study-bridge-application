"""Runs the R3 extraction (docs/EXTRACTION.md sections 1-3) through the provider-agnostic adapter."""

from __future__ import annotations

import json
from dataclasses import dataclass

from .ai import ModelRef, StructuredResult, generate_structured, load_prompt
from .clean import pages_to_text
from .env import REPO_ROOT

SCHEMA = json.loads((REPO_ROOT / "schemas" / "record_programme.schema.json").read_text(encoding="utf-8"))
TOOL_NAME = "record_programme"


@dataclass
class Extraction:
    result: StructuredResult
    truncated: bool


def extract_programme(
    pages: list[tuple[str, str]],
    *,
    target_title: str,
    target_cycle: str,
    model: ModelRef | None = None,
) -> Extraction:
    """`pages` are (url, raw_html) pairs for one programme (main page plus fees/requirements pages);
    `target_cycle` is an academic cycle such as "2027/28"."""
    page_text, truncated = pages_to_text(pages)
    prompt = load_prompt(
        "r3_extraction",
        {"target_title": target_title, "target_cycle": target_cycle, "page_text": page_text},
    )
    result = generate_structured(
        "extraction",
        prompt,
        SCHEMA,
        tool_name=TOOL_NAME,
        tool_description="Record the structured programme data extracted from the pages.",
        model=model,
    )
    return Extraction(result, truncated)
