"""Field-level scoring of an extraction against a hand-checked label (docs/EXTRACTION.md section 5).

Exact match for enums, booleans, dates and currency; exact numeric match for fees; normalised
string match for text. Every compared field counts, including fields that are correctly null,
because "not stated → null" is part of what the extractor must get right (R3 rule 1).
List items are aligned by key (fees by fee year + basis, intakes by start month, deadlines by
date, English tests by test); missing or extra items count as mismatches.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import urlsplit

Comparator = Callable[[Any, Any], bool]


def norm_text(v: Any) -> Any:
    if not isinstance(v, str):
        return v
    v = unicodedata.normalize("NFKC", v)
    v = v.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    v = re.sub(r"[‐-―]", "-", v)
    v = re.sub(r"\s+", " ", v).strip().strip(".;:,").lower()
    return v or None


def norm_url(v: Any) -> Any:
    if not isinstance(v, str):
        return v
    p = urlsplit(v.strip())
    return f"{(p.hostname or '').lower()}{p.path.rstrip('/')}"


def exact(a: Any, b: Any) -> bool:
    return a == b


def numeric(a: Any, b: Any) -> bool:
    if a is None or b is None:
        return a is None and b is None
    return float(a) == float(b)


def text(a: Any, b: Any) -> bool:
    return norm_text(a) == norm_text(b)


def url(a: Any, b: Any) -> bool:
    return norm_url(a) == norm_url(b)


def as_set(a: Any, b: Any) -> bool:
    return sorted(a or []) == sorted(b or [])


SCALARS: dict[str, Comparator] = {
    "found": exact,
    "university.name": text,
    "university.country": exact,
    "university.city": text,
    "university.official_domain": text,
    "programme.title": text,
    "programme.degree_type": exact,
    "programme.field": exact,
    "programme.duration_months": numeric,
    "programme.study_mode": exact,
    "programme.stem_designated": exact,
    "programme.has_coop_or_placement": exact,
    "programme.programme_url": url,
    "programme.apply_url": url,
    "requirement.academic_rule_text": text,
    "requirement.min_uk_class": exact,
    "requirement.min_gpa4": numeric,
    "requirement.considers_lower_with_experience": exact,
    "requirement.nigeria_rule": text,
    "requirement.english_waiver_text": text,
    "requirement.waec_english_accepted": exact,
    "requirement.gre_required": exact,
    "requirement.gmat_required": exact,
    "requirement.min_work_years": numeric,
    "requirement.documents": as_set,
}

# (list path, key fields, compared fields)
LISTS: list[tuple[str, tuple[str, ...], dict[str, Comparator]]] = [
    ("requirement.english_tests", ("test",), {"overall_min": numeric, "subscore_min": numeric}),
    ("fees", ("fee_year", "basis"), {"tuition_amount": numeric, "currency": exact, "credits_total": numeric,
                                      "application_fee": numeric}),
    ("intakes", ("start_month",), {"application_opens": exact, "deposit_amount": numeric,
                                    "deposit_currency": exact, "deposit_deadline": exact}),
]


@dataclass
class FieldScore:
    correct: int = 0
    total: int = 0

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 1.0


@dataclass
class Mismatch:
    slug: str
    field: str
    expected: Any
    got: Any


@dataclass
class Report:
    fields: dict[str, FieldScore] = field(default_factory=dict)
    mismatches: list[Mismatch] = field(default_factory=list)

    def add(self, slug: str, name: str, ok: bool, expected: Any, got: Any) -> None:
        s = self.fields.setdefault(name, FieldScore())
        s.total += 1
        if ok:
            s.correct += 1
        else:
            self.mismatches.append(Mismatch(slug, name, expected, got))

    @property
    def overall(self) -> float:
        total = sum(s.total for s in self.fields.values())
        return sum(s.correct for s in self.fields.values()) / total if total else 0.0


def get(obj: Any, dotted: str) -> Any:
    for part in dotted.split("."):
        if not isinstance(obj, dict):
            return None
        obj = obj.get(part)
    return obj


def _fee_key(v: Any) -> Any:
    if isinstance(v, str) and re.match(r"^\d{4}", v):
        years = re.findall(r"\d{4}|\d{2}", v)
        return f"{years[0]}/{years[1][-2:]}" if len(years) > 1 else years[0]
    return v


def score_one(report: Report, slug: str, label: dict, pred: dict | None) -> None:
    pred = pred or {}
    for name, cmp in SCALARS.items():
        exp, got = get(label, name), get(pred, name)
        report.add(slug, name, cmp(exp, got), exp, got)

    for path, keys, fields in LISTS:
        def key(item: dict) -> tuple:
            return tuple(_fee_key(item.get(k)) if k == "fee_year" else item.get(k) for k in keys)

        exp_items = {key(i): i for i in (get(label, path) or [])}
        got_items = {key(i): i for i in (get(pred, path) or [])}
        for k in exp_items.keys() | got_items.keys():
            e, g = exp_items.get(k), got_items.get(k)
            report.add(slug, f"{path}[]", e is not None and g is not None, k if e else None, k if g else None)
            for f, cmp in fields.items():
                ev, gv = (e or {}).get(f), (g or {}).get(f)
                report.add(slug, f"{path}[].{f}", e is not None and g is not None and cmp(ev, gv), ev, gv)

    # Deadlines: aligned by (start month, date); the label text is scored separately.
    def deadlines(rec: dict) -> dict[tuple, dict]:
        return {(i.get("start_month"), d.get("date")): d for i in (rec.get("intakes") or []) for d in i.get("deadlines", [])}

    exp_d, got_d = deadlines(label), deadlines(pred)
    for k in exp_d.keys() | got_d.keys():
        e, g = exp_d.get(k), got_d.get(k)
        report.add(slug, "intakes[].deadlines[].date", e is not None and g is not None, k if e else None, k if g else None)
        report.add(slug, "intakes[].deadlines[].date_precision",
                   bool(e and g and e.get("date_precision") == g.get("date_precision")),
                   (e or {}).get("date_precision"), (g or {}).get("date_precision"))
        report.add(slug, "intakes[].deadlines[].label", bool(e and g and text(e.get("label"), g.get("label"))),
                   (e or {}).get("label"), (g or {}).get("label"))
