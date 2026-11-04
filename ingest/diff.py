"""Compares a validated extraction with the stored record.

Only fees, deadlines and requirements decide whether a human must review (section 1 / B3 brief);
the projection below keeps exactly those, normalised so formatting noise doesn't count as change.
"""

from __future__ import annotations

import re
from typing import Any

from .validate import ProgrammeRecord, norm_fee_year, to_minor


def norm_text(value: str | None) -> str | None:
    if value is None:
        return None
    return re.sub(r"\s+", " ", value).strip().lower() or None


def project_extraction(record: ProgrammeRecord) -> dict[str, Any]:
    req = record.requirement
    tests = {t.test: t.overall_min for t in (req.english_tests if req else [])}
    toefl = sorted((t.scale or "", t.overall_min, t.subscore_min or 0) for t in (req.english_tests if req else [])
                   if t.test == "TOEFL_iBT")
    return {
        "fees": sorted(
            (f.fee_year or "", to_minor(f.tuition_amount), f.currency)
            for f in record.fees
            if f.basis == "per_year"
        ),
        "deadlines": sorted(
            (i.start_term, i.start_month or "", norm_text(d.label), d.date.isoformat())
            for i in record.intakes
            for d in i.deadlines
        ),
        "requirement": None
        if req is None
        else {
            "min_uk_class": req.min_uk_class,
            "min_gpa4": req.min_gpa4,
            "nigeria_rule": norm_text(req.nigeria_rule),
            "ielts_min": tests.get("IELTS"),
            "toefl": toefl,
            "duolingo_min": tests.get("Duolingo"),
            "gre_required": req.gre_required in ("required", "one_of_required"),
            "gmat_required": req.gmat_required in ("required", "one_of_required"),
            "min_work_years": req.min_work_years or 0,
        },
    }


def project_stored(fees: list[dict], intakes: list[dict], requirement: dict | None) -> dict[str, Any]:
    def num(v: Any) -> float | None:
        return None if v is None else float(v)

    return {
        "fees": sorted((norm_fee_year(f["fee_year"]), int(f["tuition_per_year_minor"]), f["currency"]) for f in fees),
        "deadlines": sorted(
            (i["start_term"], i["start_month"].strftime("%Y-%m") if i["start_month"] else "", norm_text(d["label"]),
             d["date"])
            for i in intakes
            for d in (i["deadlines"] or [])
        ),
        "requirement": None
        if requirement is None
        else {
            "min_uk_class": requirement["min_uk_class"],
            "min_gpa4": num(requirement["min_gpa4"]),
            "nigeria_rule": norm_text(requirement["nigeria_rule"]),
            "ielts_min": num(requirement["ielts_min"]),
            "toefl": sorted((e["scale"], float(e["overall_min"]), float(e.get("subscore_min") or 0))
                            for e in requirement["toefl_entries"]),
            "duolingo_min": num(requirement["duolingo_min"]),
            "gre_required": bool(requirement["gre_required"]),
            "gmat_required": bool(requirement["gmat_required"]),
            "min_work_years": float(requirement["min_work_years"] or 0),
        },
    }


def diff(current: dict[str, Any], proposed: dict[str, Any]) -> dict[str, Any]:
    """{section: {"current": ..., "proposed": ...}} for every section that differs."""
    out: dict[str, Any] = {}
    for key in ("fees", "deadlines", "requirement"):
        cur, new = current.get(key), proposed.get(key)
        if key == "requirement" and cur is not None and new is not None:
            changed = {k: {"current": cur[k], "proposed": new[k]} for k in new if _ne(cur.get(k), new[k])}
            if changed:
                out[key] = changed
        elif _ne(cur, new):
            out[key] = {"current": cur, "proposed": new}
    return out


def _ne(a: Any, b: Any) -> bool:
    if isinstance(a, float) or isinstance(b, float):
        return a is None or b is None or abs(float(a) - float(b)) > 1e-9
    return _jsonable(a) != _jsonable(b)


def _jsonable(v: Any) -> Any:
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    return v
