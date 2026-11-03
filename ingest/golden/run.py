"""Golden-set accuracy report and model comparison.

  uv run --project ingest python -m ingest.golden.run                       # configured extraction model
  npm run ai:compare -- --task extraction --models anthropic:claude-haiku-5-5,gemini:gemini-3.6-flash,...

Reads saved pages (golden/pages) and hand-checked labels (golden/labels); never fetches.
Prints per-field accuracy, every mismatch, average latency and total tokens per model.
Exits 1 when the first model's overall accuracy is below the 95% target.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from ..ai import ModelRef, model_for
from ..extract import extract_programme
from .scoring import Report, score_one

GOLDEN = Path(__file__).resolve().parent
TARGET = 0.95


@dataclass
class ModelRun:
    ref: ModelRef
    report: Report = field(default_factory=Report)
    latencies_ms: list[int] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    errors: dict[str, str] = field(default_factory=dict)


def load_cases(only: set[str] | None) -> list[dict]:
    manifest = json.loads((GOLDEN / "manifest.json").read_text(encoding="utf-8"))
    cases = []
    for case in manifest["cases"]:
        if only and case["slug"] not in only:
            continue
        label_path = GOLDEN / "labels" / f"{case['slug']}.json"
        page_paths = [GOLDEN / "pages" / f"{case['slug']}__{i}.html" for i in range(len(case["urls"]))]
        missing = [p.name for p in [label_path, *page_paths] if not p.exists()]
        if missing:
            print(f"skip {case['slug']}: missing {', '.join(missing)}", file=sys.stderr)
            continue
        case["label"] = json.loads(label_path.read_text(encoding="utf-8"))
        case["pages"] = [(u, p.read_text(encoding="utf-8")) for u, p in zip(case["urls"], page_paths)]
        cases.append(case)
    return cases


def run_model(ref: ModelRef, cases: list[dict]) -> ModelRun:
    run = ModelRun(ref)
    for case in cases:
        started = time.perf_counter()
        try:
            ext = extract_programme(case["pages"], target_title=case["target_title"],
                                    target_intake_year=case["target_intake_year"], model=ref)
            pred = ext.result.data
            run.input_tokens += ext.result.input_tokens or 0
            run.output_tokens += ext.result.output_tokens or 0
        except Exception as err:  # noqa: BLE001 - a failed case scores as all-wrong, and is listed
            pred = None
            run.errors[case["slug"]] = f"{type(err).__name__}: {err}"[:300]
        run.latencies_ms.append(int((time.perf_counter() - started) * 1000))
        score_one(run.report, case["slug"], case["label"], pred)
        print(f"  {ref.label:<45} {case['slug']:<40} {'error' if pred is None else 'ok'}", file=sys.stderr)
    return run


def print_report(runs: list[ModelRun], show_mismatches: bool) -> None:
    fields = sorted({f for r in runs for f in r.report.fields})
    width = max(len(f) for f in fields) if fields else 10
    head = "".join(f"{r.ref.label[:28]:>30}" for r in runs)
    print(f"\nPer-field accuracy\n{'field':<{width}}{head}")
    for f in fields:
        cells = ""
        for r in runs:
            s = r.report.fields.get(f)
            cells += f"{'' if s is None else f'{s.accuracy:6.1%} ({s.correct}/{s.total})':>30}"
        print(f"{f:<{width}}{cells}")

    print(f"\n{'model':<45}{'overall':>9}{'avg latency':>13}{'input tok':>12}{'output tok':>12}{'errors':>8}")
    for r in runs:
        avg = statistics.mean(r.latencies_ms) if r.latencies_ms else 0
        print(f"{r.ref.label:<45}{r.report.overall:>9.1%}{avg / 1000:>12.1f}s{r.input_tokens:>12,}{r.output_tokens:>12,}"
              f"{len(r.errors):>8}")

    for r in runs:
        if r.errors:
            print(f"\nErrors ({r.ref.label}):")
            for slug, err in r.errors.items():
                print(f"  {slug}: {err}")
        if show_mismatches and r.report.mismatches:
            print(f"\nMismatches ({r.ref.label}): {len(r.report.mismatches)}")
            for m in r.report.mismatches:
                print(f"  {m.slug} | {m.field} | expected {json.dumps(m.expected, default=str)[:120]} "
                      f"| got {json.dumps(m.got, default=str)[:120]}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--task", default="extraction", choices=["extraction"])
    ap.add_argument("--models", help="comma-separated provider:model list (default: config/ai.json)")
    ap.add_argument("--cases", help="comma-separated slugs (default: all)")
    ap.add_argument("--no-mismatches", action="store_true")
    args = ap.parse_args(argv)

    refs = [ModelRef.parse(s.strip()) for s in args.models.split(",")] if args.models else [model_for(args.task)]
    cases = load_cases(set(args.cases.split(",")) if args.cases else None)
    if not cases:
        print("No golden cases with both pages and labels. Run `python -m ingest.golden.fetch` first.", file=sys.stderr)
        return 2
    print(f"{len(cases)} cases × {len(refs)} model(s)", file=sys.stderr)
    runs = [run_model(ref, cases) for ref in refs]
    print_report(runs, show_mismatches=not args.no_mismatches)

    first = runs[0]
    if first.report.overall < TARGET:
        failing = [f for f, s in first.report.fields.items() if s.accuracy < TARGET]
        print(f"\nBELOW TARGET: {first.report.overall:.1%} < {TARGET:.0%} for {first.ref.label}. "
              f"Fields under target: {', '.join(sorted(failing))}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
