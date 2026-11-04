"""Pydantic validation of a record_programme extraction + the review rules in docs/EXTRACTION.md section 4.

The extraction has already passed the JSON Schema check in ingest.ai; this layer adds types, the
business rules that decide auto-update vs human review, and the major → minor unit conversion.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
import datetime as dt
from decimal import Decimal
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Application portals accepted for any university (section 4); per-university portals live in
# university.official_domains.
PORTAL_ALLOW_LIST = ("ucas.com", "ouac.on.ca")
TUITION_RANGE_PER_YEAR = {"GBP": (8_000, 60_000), "CAD": (10_000, 80_000), "USD": (10_000, 120_000)}
MIN_SECTION_CONFIDENCE = 0.7
OLD_FEE_YEAR_CONFIDENCE = 0.6
FIRST_CYCLE_MONTH = 8  # an academic cycle 2027/28 runs from August 2027 to July 2028


def norm_fee_year(value: str) -> str:
    """"2027-2028", "2027/2028", "2027–28" and a single "2027" → "2027/28" (a single year is the
    academic year starting then). Anything without a four-digit year is returned trimmed."""
    years = re.findall(r"\d{4}|\d{2}", value)
    if not years or len(years[0]) != 4:
        return value.strip()
    start = int(years[0])
    end = years[1][-2:] if len(years) >= 2 else f"{(start + 1) % 100:02d}"
    return f"{start}/{end}"


def cycle_start(cycle: str) -> int:
    """First calendar year of a cycle such as "2027/28"."""
    m = re.match(r"\s*(\d{4})", cycle)
    if not m:
        raise ValueError(f"Not a cycle like 2027/28: {cycle!r}")
    return int(m.group(1))


TERM_FIRST_MONTH = {"fall": 8, "winter": 1, "spring": 3, "summer": 6}


def cycle_of(year: int, month: int) -> str:
    """The cycle a start month belongs to: September 2027, January 2028 and May 2028 are all 2027/28."""
    start = year if month >= FIRST_CYCLE_MONTH else year - 1
    return f"{start}/{(start + 1) % 100:02d}"


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


class University(_M):
    name: str
    country: Literal["UK", "CA", "US"]
    city: str | None
    official_domain: str


class Programme(_M):
    title: str
    degree_type: Literal["MSc", "MA", "MEng", "MBA", "MRes", "MPH", "LLM", "MPS", "Other"]
    field: Literal["computer_data_science", "public_health", "business_finance", "engineering", "project_management",
                   "law", "other"]
    duration_months: int | None = Field(ge=6, le=36)
    study_mode: Literal["full_time", "part_time", "online", "blended"] | None
    stem_designated: bool | None = None
    has_coop_or_placement: bool | None = None
    description: str | None = Field(default=None, max_length=1200)
    programme_url: str
    apply_url: str | None


class EnglishTest(_M):
    test: Literal["IELTS", "TOEFL_iBT", "PTE", "Duolingo", "Cambridge", "Other"]
    scale: Literal["0-120", "1-6"] | None = None
    overall_min: float
    subscore_min: float | None = None
    notes: str | None = None


Requiredness = Literal["required", "optional", "not_required", "one_of_required"] | None


class Requirement(_M):
    academic_rule_text: str | None
    min_uk_class: Literal["first", "upper_second", "lower_second", "third", "pass"] | None
    min_gpa4: float | None = Field(ge=0, le=4)
    considers_lower_with_experience: bool | None = None
    nigeria_rule: str | None
    english_tests: list[EnglishTest]
    english_waiver_text: str | None
    waec_english_accepted: bool | None = None
    gre_required: Requiredness
    gmat_required: Requiredness
    min_work_years: float | None = Field(ge=0)
    documents: list[Literal["sop", "references", "cv", "transcript", "portfolio", "writing_sample", "interview", "other"]]


class Deadline(_M):
    label: str
    date: dt.date
    date_precision: Literal["day", "month"]


class Intake(_M):
    start_term: Literal["fall", "winter", "spring", "summer"]
    start_month: str | None = Field(pattern=r"^\d{4}-\d{2}$")
    application_opens: dt.date | None = None
    deadlines: list[Deadline]
    deposit_amount: float | None = None
    deposit_currency: Literal["GBP", "CAD", "USD"] | None = None
    deposit_deadline: dt.date | None = None

    def in_cycle(self, cycle: str) -> bool:
        """A term-only intake has no year of its own, so it can only belong to the target cycle."""
        if self.start_month is None:
            return True
        y, m = map(int, self.start_month.split("-"))
        return cycle_of(y, m) == cycle

    def start_date(self, cycle: str) -> dt.date:
        """First day of the start month, or of the term's first month for a term-only intake."""
        if self.start_month is not None:
            y, m = map(int, self.start_month.split("-"))
            return dt.date(y, m, 1)
        m = TERM_FIRST_MONTH[self.start_term]
        return dt.date(cycle_start(cycle) + (m < FIRST_CYCLE_MONTH), m, 1)


class Fee(_M):
    fee_year: str | None
    tuition_amount: float = Field(ge=0)
    currency: Literal["GBP", "CAD", "USD"]
    basis: Literal["per_year", "total", "per_credit", "per_term"]
    credits_total: float | None = None
    application_fee: float | None = None

    @field_validator("fee_year")
    @classmethod
    def _normalise_fee_year(cls, value: str | None) -> str | None:
        return None if value is None else norm_fee_year(value)


class Scholarship(_M):
    name: str
    amount: float | None = None
    currency: Literal["GBP", "CAD", "USD"] | None = None
    coverage_text: str | None = None
    eligibility_text: str | None = None
    deadline: dt.date | None = None
    url: str | None


class Confidence(_M):
    programme: float = Field(ge=0, le=1)
    requirement: float = Field(ge=0, le=1)
    intakes: float = Field(ge=0, le=1)
    fees: float = Field(ge=0, le=1)
    scholarships: float = Field(ge=0, le=1)


class ProgrammeRecord(_M):
    found: bool
    university: University | None
    programme: Programme | None
    requirement: Requirement | None
    intakes: list[Intake]
    fees: list[Fee]
    scholarships: list[Scholarship]
    confidence: Confidence
    missing_fields: list[str]
    source_urls: list[str] = Field(min_length=1)


# ---------------------------------------------------------------------------------------

ReviewCode = Literal[
    "not_found", "off_domain_url", "tuition_out_of_range", "fee_needs_annualising", "deadline_in_past",
    "deadline_after_start", "fee_year_old", "low_confidence", "input_truncated", "no_programme",
]


@dataclass(frozen=True)
class Issue:
    code: ReviewCode
    message: str
    path: str = ""


@dataclass
class Outcome:
    record: ProgrammeRecord
    issues: list[Issue] = field(default_factory=list)
    broken_source: bool = False

    @property
    def needs_review(self) -> bool:
        return bool(self.issues)


def to_minor(amount: float | int | Decimal) -> int:
    """Major → minor units (all supported currencies have 2 decimals). Exact for printed amounts."""
    return int((Decimal(str(amount)) * 100).quantize(Decimal(1)))


def host_allowed(url: str | None, official_domains: list[str]) -> bool:
    if not url:
        return True  # a missing link is recorded as null, not an off-domain link
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        return False
    host = parts.hostname.lower()
    allowed = [d.lower().lstrip(".") for d in [*official_domains, *PORTAL_ALLOW_LIST] if d]
    return any(host == d or host.endswith("." + d) for d in allowed)


def validate_record(
    raw: dict,
    *,
    target_cycle: str,
    run_date: dt.date,
    official_domains: list[str] | None = None,
    input_truncated: bool = False,
) -> Outcome:
    """Applies section 4. `official_domains` are the university's stored domains (allow-list);
    when unknown (new university), the extracted official_domain is used and the record
    always goes to review anyway as a new programme."""
    record = ProgrammeRecord.model_validate(raw)
    out = Outcome(record)
    add = out.issues.append

    if not record.found:
        out.broken_source = True
        add(Issue("not_found", "Target programme not described on the source pages"))
        return out
    if record.programme is None or record.university is None:
        add(Issue("no_programme", "found = true but programme or university is missing"))
        return out

    domains = list(official_domains or []) or [record.university.official_domain]
    for name in ("programme_url", "apply_url"):
        url = getattr(record.programme, name)
        if not host_allowed(url, domains):
            add(Issue("off_domain_url", f"{name} {url} is not on {', '.join(domains)} or an allowed portal",
                      f"programme.{name}"))

    years = (record.programme.duration_months or 12) / 12
    for i, fee in enumerate(record.fees):
        path = f"fees[{i}]"
        if fee.basis in ("per_credit", "per_term"):
            add(Issue("fee_needs_annualising", f"{fee.basis} fee needs a human to compute the annual figure", path))
        else:
            per_year = fee.tuition_amount / years if fee.basis == "total" and years > 1 else fee.tuition_amount
            lo, hi = TUITION_RANGE_PER_YEAR[fee.currency]
            if not lo <= per_year <= hi:
                add(Issue("tuition_out_of_range", f"{fee.currency} {per_year:,.0f}/year outside {lo:,}–{hi:,}", path))
        if fee.fee_year is None:
            add(Issue("fee_year_missing", "The pages don't print the academic year for this fee", path))
            continue
        m = re.match(r"(\d{4})/", fee.fee_year)  # already normalised to YYYY/YY
        if m and int(m.group(1)) < cycle_start(target_cycle):
            add(Issue("fee_year_old", "fees not yet published for target year", path))
            record.confidence.fees = min(record.confidence.fees, OLD_FEE_YEAR_CONFIDENCE)

    for i, test in enumerate(record.requirement.english_tests if record.requirement else []):
        if test.test == "TOEFL_iBT" and test.scale is None:
            add(Issue("toefl_scale_missing", "TOEFL entry doesn't say which scale it is on",
                      f"requirement.english_tests[{i}]"))

    extracted = len(record.intakes)
    record.intakes = [intake for intake in record.intakes if intake.in_cycle(target_cycle)]
    if extracted and not record.intakes:
        add(Issue("no_intake_in_cycle", f"None of the {extracted} extracted intakes is in {target_cycle}", "intakes"))

    for i, intake in enumerate(record.intakes):
        start = intake.start_date(target_cycle)
        for j, d in enumerate(intake.deadlines):
            path = f"intakes[{i}].deadlines[{j}]"
            if d.date <= run_date:
                add(Issue("deadline_in_past", f"{d.label}: {d.date} is not after the run date {run_date}", path))
            if d.date >= start:
                add(Issue("deadline_after_start", f"{d.label}: {d.date} is not before the {start:%Y-%m} start",
                          path))

    for section, value in record.confidence.model_dump().items():
        if value < MIN_SECTION_CONFIDENCE:
            add(Issue("low_confidence", f"{section} confidence {value:.2f} < {MIN_SECTION_CONFIDENCE}", section))

    if input_truncated:
        add(Issue("input_truncated", "Page text exceeded the extraction limit and was cut; fields may be missing"))
    return out
