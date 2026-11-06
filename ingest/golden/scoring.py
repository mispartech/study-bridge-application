"""Field-level scoring of an extraction against a hand-checked label (docs/EXTRACTION.md section 5).

Exact match for enums, booleans, dates and currency; exact numeric match for fees. Fee years are
normalised to YYYY/YY on both sides. Names and cities ignore a leading "The", case and accents, and a
null extracted city is not an error (the pipeline fills it from the university table). Copied text
matches when the label is contained in the model's text and the model's text is at most twice as
long. Documents match on set overlap. Every compared field counts, including fields that are
correctly null, because "not stated → null" is part of what the extractor must get right (R3 rule 1).
List items are aligned by key (fees by fee year + basis, intakes by term and month, deadlines by
date, English tests by test and scale); missing or extra items count as mismatches.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import urlsplit

from ..validate import norm_fee_year

Comparator = Callable[[Any, Any], bool]

TEXT_MAX_RATIO = 2.0
DOCUMENTS_MIN_OVERLAP = 0.8
CRITICAL_TARGET = 0.95
NON_CRITICAL_TARGET = 0.85

# docs/EXTRACTION.md section 5: fees, fee year, deadlines, intake dates, English minimums,
# academic minimum and apply_url must reach 95%; everything else 85%.
CRITICAL_FIELDS = frozenset({
    "fees[]", "fees[].tuition_amount", "fees[].currency", "fees[].credits_total", "fees[].application_fee",
    "intakes[]", "intakes[].application_opens", "intakes[].deposit_deadline",
    "intakes[].deadlines[].date", "intakes[].deadlines[].date_precision",
    "requirement.english_tests[]", "requirement.english_tests[].overall_min",
    "requirement.english_tests[].subscore_min",
    "requirement.min_uk_class", "requirement.min_gpa4",
    "programme.apply_url",
})


def norm_text(v: Any) -> Any:
    if not isinstance(v, str):
        return v
    v = unicodedata.normalize("NFKC", v)
    v = v.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    v = re.sub(r"[‐-―]", "-", v)
    v = re.sub(r"\s+", " ", v).strip().strip(".;:,").lower()
    return v or None


def norm_name(v: Any) -> Any:
    """Case-, accent- and leading-"The"-insensitive form of a university name or city."""
    if not isinstance(v, str):
        return v
    v = "".join(c for c in unicodedata.normalize("NFKD", v) if not unicodedata.combining(c))
    v = norm_text(v)
    return re.sub(r"^the ", "", v) if v else v


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


def name(a: Any, b: Any) -> bool:
    return norm_name(a) == norm_name(b)


def city(a: Any, b: Any) -> bool:
    return b is None or name(a, b)


def copied_text(expected: Any, got: Any) -> bool:
    """The label is contained in the model's text, and the model didn't copy more than twice as much."""
    e, g = norm_text(expected), norm_text(got)
    if e is None or g is None:
        return e is None and g is None
    return e in g and len(g) <= TEXT_MAX_RATIO * len(e)


def url(a: Any, b: Any) -> bool:
    return norm_url(a) == norm_url(b)


def overlap(a: Any, b: Any) -> bool:
    sa, sb = set(a or []), set(b or [])
    if not sa and not sb:
        return True
    return len(sa & sb) / len(sa | sb) >= DOCUMENTS_MIN_OVERLAP


SCALARS: dict[str, Comparator] = {
    "found": exact,
    "university.name": name,
    "university.country": exact,
    "university.city": city,
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
    "requirement.academic_rule_text": copied_text,
    "requirement.min_uk_class": exact,
    "requirement.min_gpa4": numeric,
    "requirement.considers_lower_with_experience": exact,
    "requirement.nigeria_rule": copied_text,
    "requirement.english_waiver_text": copied_text,
    "requirement.waec_english_accepted": exact,
    "requirement.waec_min_grade": exact,
    "requirement.gre_required": exact,
    "requirement.gmat_required": exact,
    "requirement.min_work_years": numeric,
    "requirement.documents": overlap,
}

# (list path, key fields, compared fields)
LISTS: list[tuple[str, tuple[str, ...], dict[str, Comparator]]] = [
    ("requirement.english_tests", ("test", "scale"), {"overall_min": numeric, "subscore_min": numeric}),
    ("fees", ("fee_year", "basis"), {"tuition_amount": numeric, "currency": exact, "credits_total": numeric,
                                      "application_fee": numeric}),
    ("intakes", ("start_term", "start_month"), {"application_opens": exact, "deposit_amount": numeric,
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

    def _accuracy(self, critical: bool | None) -> float:
        scores = [s for f, s in self.fields.items() if critical is None or (f in CRITICAL_FIELDS) == critical]
        total = sum(s.total for s in scores)
        return sum(s.correct for s in scores) / total if total else 1.0

    @property
    def overall(self) -> float:
        return self._accuracy(None)

    @property
    def critical(self) -> float:
        return self._accuracy(True)

    @property
    def non_critical(self) -> float:
        return self._accuracy(False)

    @property
    def passes(self) -> bool:
        return self.critical >= CRITICAL_TARGET and self.non_critical >= NON_CRITICAL_TARGET

    def failing_fields(self) -> list[str]:
        return sorted(f for f, s in self.fields.items()
                      if s.accuracy < (CRITICAL_TARGET if f in CRITICAL_FIELDS else NON_CRITICAL_TARGET))


def get(obj: Any, dotted: str) -> Any:
    for part in dotted.split("."):
        if not isinstance(obj, dict):
            return None
        obj = obj.get(part)
    return obj


def _fee_key(v: Any) -> Any:
    return norm_fee_year(v) if isinstance(v, str) else v


def score_one(report: Report, slug: str, label: dict, pred: dict | None) -> None:
    pred = pred or {}
    for name_, cmp in SCALARS.items():
        exp, got = get(label, name_), get(pred, name_)
        report.add(slug, name_, cmp(exp, got), exp, got)

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

    # Deadlines: aligned by (term, month, date); the label text is scored separately.
    def deadlines(rec: dict) -> dict[tuple, dict]:
        return {(i.get("start_term"), i.get("start_month"), d.get("date")): d
                for i in (rec.get("intakes") or []) for d in i.get("deadlines", [])}

    exp_d, got_d = deadlines(label), deadlines(pred)
    for k in exp_d.keys() | got_d.keys():
        e, g = exp_d.get(k), got_d.get(k)
        report.add(slug, "intakes[].deadlines[].date", e is not None and g is not None, k if e else None, k if g else None)
        report.add(slug, "intakes[].deadlines[].date_precision",
                   bool(e and g and e.get("date_precision") == g.get("date_precision")),
                   (e or {}).get("date_precision"), (g or {}).get("date_precision"))
        report.add(slug, "intakes[].deadlines[].label", bool(e and g and copied_text(e.get("label"), g.get("label"))),
                   (e or {}).get("label"), (g or {}).get("label"))
