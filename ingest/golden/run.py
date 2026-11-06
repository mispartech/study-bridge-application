"""Golden-set accuracy report and model comparison.

  uv run --project ingest python -m ingest.golden.run                       # configured extraction model
  npm run ai:compare -- --task extraction --models anthropic:claude-haiku-5-5,gemini:gemini-3.6-flash,...

Reads saved pages (golden/pages) and hand-checked labels (golden/labels); never fetches.
Scores the golden set and the hold-out set (manifest cases with "holdout": true) separately, each
with a critical and a non-critical accuracy (docs/EXTRACTION.md section 5), and prints every
mismatch, average latency and total tokens per model.
Exits 1 when the first model misses a target on either set, 2 when any case failed to run.
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
from .scoring import CRITICAL_FIELDS, CRITICAL_TARGET, NON_CRITICAL_TARGET, Report, score_one

GOLDEN = Path(__file__).resolve().parent
SETS = ("golden", "holdout")


@dataclass
class ModelRun:
    ref: ModelRef
    reports: dict[str, Report] = field(default_factory=lambda: {s: Report() for s in SETS})
    latencies_ms: list[int] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    errors: dict[str, str] = field(default_factory=dict)


def case_set(case: dict) -> str:
    return "holdout" if case.get("holdout") else "golden"


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
                                    target_cycle=case["target_cycle"], model=ref)
            pred = ext.result.data
            run.input_tokens += ext.result.input_tokens or 0
            run.output_tokens += ext.result.output_tokens or 0
        except Exception as err:  # noqa: BLE001 - a failed case scores as all-wrong, and is listed
            pred = None
            run.errors[case["slug"]] = f"{type(err).__name__}: {err}"[:300]
        run.latencies_ms.append(int((time.perf_counter() - started) * 1000))
        score_one(run.reports[case_set(case)], case["slug"], case["label"], pred)
        print(f"  {ref.label:<45} {case['slug']:<40} {'error' if pred is None else 'ok'}", file=sys.stderr)
    return run


def print_set(runs: list[ModelRun], name: str, show_mismatches: bool) -> None:
    reports = [(r, r.reports[name]) for r in runs]
    fields = sorted({f for _, rep in reports for f in rep.fields})
    if not fields:
        return
    width = max(len(f) for f in fields) + 4
    head = "".join(f"{r.ref.label[:28]:>30}" for r in runs)
    print(f"\n=== {name.upper()} SET ===\nPer-field accuracy (* = critical, target {CRITICAL_TARGET:.0%}; "
          f"others {NON_CRITICAL_TARGET:.0%})\n{'field':<{width}}{head}")
    for f in fields:
        cells = ""
        for _, rep in reports:
            s = rep.fields.get(f)
            cells += f"{'' if s is None else f'{s.accuracy:6.1%} ({s.correct}/{s.total})':>30}"
        print(f"{('* ' if f in CRITICAL_FIELDS else '  ') + f:<{width}}{cells}")
    print(f"\n{'model':<45}{'critical':>10}{'non-critical':>14}{'overall':>9}  result")
    for r, rep in reports:
        print(f"{r.ref.label:<45}{rep.critical:>10.1%}{rep.non_critical:>14.1%}{rep.overall:>9.1%}  "
              f"{'PASS' if rep.passes else 'FAIL'}")
    if show_mismatches:
        for r, rep in reports:
            if rep.mismatches:
                print(f"\nMismatches ({name}, {r.ref.label}): {len(rep.mismatches)}")
                for m in rep.mismatches:
                    print(f"  {m.slug} | {m.field} | expected {json.dumps(m.expected, default=str)[:120]} "
                          f"| got {json.dumps(m.got, default=str)[:120]}")


def print_report(runs: list[ModelRun], show_mismatches: bool) -> None:
    for name in SETS:
        print_set(runs, name, show_mismatches)
    print(f"\n{'model':<45}{'avg latency':>13}{'input tok':>12}{'output tok':>12}{'errors':>8}")
    for r in runs:
        avg = statistics.mean(r.latencies_ms) if r.latencies_ms else 0
        print(f"{r.ref.label:<45}{avg / 1000:>12.1f}s{r.input_tokens:>12,}{r.output_tokens:>12,}{len(r.errors):>8}")
    for r in runs:
        if r.errors:
            print(f"\nErrors ({r.ref.label}):")
            for slug, err in r.errors.items():
                print(f"  {slug}: {err}")


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
    if first.errors:
        print(f"\nNOT A VALID SCORE: {len(first.errors)}/{len(cases)} cases failed to run for {first.ref.label} "
              f"(failed cases score as all-null). Fix the errors above and re-run.")
        return 2
    failed = [name for name in SETS if first.reports[name].fields and not first.reports[name].passes]
    if failed:
        for name in failed:
            print(f"\nBELOW TARGET on the {name} set for {first.ref.label}. Fields under target: "
                  f"{', '.join(first.reports[name].failing_fields())}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
