import copy
import datetime as dt

import httpx
import pytest
import respx

from ingest.clean import clean_html, pages_to_text
from ingest.diff import diff, norm_fee_year, project_extraction, project_stored
from ingest.golden.scoring import Report, score_one
from ingest.validate import cycle_of, host_allowed, to_minor, validate_record

RUN_DATE = dt.date(2026, 11, 2)

GOOD = {
    "found": True,
    "university": {"name": "Example University", "country": "UK", "city": "Leeds", "official_domain": "example.ac.uk"},
    "programme": {
        "title": "MSc Data Science", "degree_type": "MSc", "field": "computer_data_science", "duration_months": 12,
        "study_mode": "full_time", "stem_designated": None, "has_coop_or_placement": False, "description": None,
        "programme_url": "https://www.example.ac.uk/courses/msc-data-science",
        "apply_url": "https://apply.example.ac.uk/pg",
    },
    "requirement": {
        "academic_rule_text": "A 2:1 honours degree.", "min_uk_class": "upper_second", "min_gpa4": None,
        "considers_lower_with_experience": None,
        "nigeria_rule": "Bachelor degree with a CGPA of 3.5/5.0 or 3.0/4.0",
        "english_tests": [{"test": "IELTS", "overall_min": 6.5, "subscore_min": 6.0, "notes": None}],
        "english_waiver_text": None, "waec_english_accepted": True, "gre_required": "not_required",
        "gmat_required": "not_required", "min_work_years": None, "documents": ["sop", "references", "transcript"],
    },
    "intakes": [{"start_term": "fall", "start_month": "2027-09", "deadlines": [
        {"label": "International applicants", "date": "2027-06-30", "date_precision": "day"}]}],
    "fees": [{"fee_year": "2027/28", "tuition_amount": 24500, "currency": "GBP", "basis": "per_year"}],
    "scholarships": [],
    "confidence": {"programme": 0.95, "requirement": 0.9, "intakes": 0.9, "fees": 0.95, "scholarships": 0.8},
    "missing_fields": [],
    "source_urls": ["https://www.example.ac.uk/courses/msc-data-science"],
}


def check(rec=None, **kw):
    kw.setdefault("target_cycle", "2027/28")
    kw.setdefault("run_date", RUN_DATE)
    kw.setdefault("official_domains", ["example.ac.uk"])
    return validate_record(rec or copy.deepcopy(GOOD), **kw)


def codes(outcome):
    return sorted(i.code for i in outcome.issues)


# --- validator (section 4) ----------------------------------------------------------

def test_clean_record_passes():
    assert codes(check()) == []


def test_money_converts_to_minor_units_exactly():
    assert to_minor(24500) == 2_450_000
    assert to_minor(1234.56) == 123_456
    assert to_minor(0.1) == 10


@pytest.mark.parametrize(
    ("url", "ok"),
    [
        ("https://www.example.ac.uk/x", True),
        ("https://example.ac.uk/x", True),
        ("https://digital.ucas.com/coursedisplay/x", True),
        ("https://www.ouac.on.ca/apply/", True),
        ("http://www.example.ac.uk/x", False),
        ("https://example.ac.uk.evil.com/x", False),
        ("https://notexample.ac.uk/x", False),
        ("https://study-agent.com/example", False),
        (None, True),
    ],
)
def test_url_allow_list(url, ok):
    assert host_allowed(url, ["example.ac.uk"]) is ok


def test_off_domain_apply_url_goes_to_review():
    rec = copy.deepcopy(GOOD)
    rec["programme"]["apply_url"] = "https://www.some-agent.com/apply"
    assert codes(check(rec)) == ["off_domain_url"]


@pytest.mark.parametrize(("currency", "amount", "flag"), [("GBP", 7_999, True), ("GBP", 60_000, False),
                                                         ("CAD", 85_000, True), ("USD", 119_000, False)])
def test_tuition_ranges(currency, amount, flag):
    rec = copy.deepcopy(GOOD)
    rec["fees"][0].update(currency=currency, tuition_amount=amount)
    assert ("tuition_out_of_range" in codes(check(rec))) is flag


def test_total_fee_is_annualised_for_the_range_check():
    rec = copy.deepcopy(GOOD)
    rec["programme"]["duration_months"] = 24
    rec["fees"][0].update(currency="USD", tuition_amount=150_000, basis="total")  # 75k a year
    assert codes(check(rec)) == []


def test_per_credit_fee_needs_a_human():
    rec = copy.deepcopy(GOOD)
    rec["fees"][0].update(currency="USD", tuition_amount=1_650, basis="per_credit", credits_total=30)
    assert codes(check(rec)) == ["fee_needs_annualising"]


def test_deadlines_must_be_future_and_before_start():
    rec = copy.deepcopy(GOOD)
    rec["intakes"][0]["deadlines"] = [
        {"label": "Round 1", "date": "2026-10-01", "date_precision": "day"},
        {"label": "Late", "date": "2027-09-15", "date_precision": "day"},
    ]
    assert codes(check(rec)) == ["deadline_after_start", "deadline_in_past"]


def test_old_fee_year_keeps_record_but_lowers_confidence():
    rec = copy.deepcopy(GOOD)
    rec["fees"][0]["fee_year"] = "2026/27"
    out = check(rec)
    assert codes(out) == ["fee_year_old", "low_confidence"]
    assert out.record.confidence.fees == 0.6
    assert out.record.fees  # kept


def test_low_section_confidence_goes_to_review():
    rec = copy.deepcopy(GOOD)
    rec["confidence"]["intakes"] = 0.65
    assert codes(check(rec)) == ["low_confidence"]


def test_not_found_marks_source_broken():
    rec = copy.deepcopy(GOOD) | {"found": False}
    out = check(rec)
    assert out.broken_source and codes(out) == ["not_found"]


def test_truncated_input_goes_to_review():
    assert codes(check(input_truncated=True)) == ["input_truncated"]


# --- diff ------------------------------------------------------------------------------

def _stored_requirement():
    return {"min_uk_class": "upper_second", "min_gpa4": None,
            "nigeria_rule": "Bachelor degree with a CGPA of 3.5/5.0 or 3.0/4.0",
            "ielts_min": 6.5, "toefl_entries": [], "duolingo_min": None, "gre_status": "not_required",
            "gmat_status": "not_required", "min_work_years": 0}


def stored(**over):
    base = {
        "fees": [{"fee_year": "2027/28", "tuition_per_year_minor": 2_450_000, "currency": "GBP"}],
        "intakes": [{"start_term": "fall", "start_month": dt.date(2027, 9, 1),
                     "deadlines": [{"label": "international applicants", "date": "2027-06-30"}]}],
        "requirement": _stored_requirement(),
    }
    base.update(over)
    return project_stored(base["fees"], base["intakes"], base["requirement"])


def test_unchanged_record_has_no_diff_despite_formatting():
    rec = check().record
    assert diff(stored(), project_extraction(rec)) == {}


def test_fee_change_is_detected():
    rec = copy.deepcopy(GOOD)
    rec["fees"][0]["tuition_amount"] = 25_000
    changes = diff(stored(), project_extraction(check(rec).record))
    assert list(changes) == ["fees"]


def test_requirement_field_change_is_detected():
    rec = copy.deepcopy(GOOD)
    rec["requirement"]["english_tests"][0]["overall_min"] = 7.0
    changes = diff(stored(), project_extraction(check(rec).record))
    assert changes == {"requirement": {"ielts_min": {"current": 6.5, "proposed": 7.0}}}


def test_fee_year_formats_normalise():
    assert norm_fee_year("2027-2028") == norm_fee_year("2027/28") == norm_fee_year("2027–2028") == "2027/28"
    assert norm_fee_year("2027") == "2027/28"  # a single year is the academic year starting then
    assert norm_fee_year("2029/2030") == "2029/30"


def test_validator_stores_normalised_fee_year_and_flags_older_cycles():
    rec = copy.deepcopy(GOOD)
    rec["fees"][0]["fee_year"] = "2026"
    out = check(rec)
    assert out.record.fees[0].fee_year == "2026/27"
    assert "fee_year_old" in [i.code for i in out.issues]


def test_null_fee_year_goes_to_review():
    rec = copy.deepcopy(GOOD)
    rec["fees"][0]["fee_year"] = None
    out = check(rec)
    assert "fee_year_missing" in [i.code for i in out.issues]
    assert project_extraction(out.record)["fees"] == [("", 2_450_000, "GBP")]


def test_out_of_cycle_intakes_are_dropped():
    rec = copy.deepcopy(GOOD)
    rec["intakes"].insert(0, {"start_term": "winter", "start_month": "2027-01", "deadlines": []})
    out = check(rec)
    assert [i.start_month for i in out.record.intakes] == ["2027-09"]
    assert "no_intake_in_cycle" not in [i.code for i in out.issues]

    rec["intakes"] = rec["intakes"][:1]
    out = check(rec)
    assert out.record.intakes == []
    assert "no_intake_in_cycle" in [i.code for i in out.issues]


def test_term_only_intake_stays_in_cycle_and_checks_deadlines_against_the_term():
    rec = copy.deepcopy(GOOD)
    rec["intakes"][0].update(start_term="fall", start_month=None)
    out = check(rec)
    assert len(out.record.intakes) == 1
    assert out.issues == []
    assert project_extraction(out.record)["deadlines"] == [("fall", "", "international applicants", "2027-06-30")]
    rec["intakes"][0]["deadlines"][0]["date"] = "2027-08-15"  # fall starts from August at the earliest
    assert "deadline_after_start" in [i.code for i in check(rec).issues]


def test_toefl_needs_a_scale_and_both_scales_are_compared():
    rec = copy.deepcopy(GOOD)
    rec["requirement"]["english_tests"] += [{"test": "TOEFL_iBT", "scale": "0-120", "overall_min": 90},
                                            {"test": "TOEFL_iBT", "scale": "1-6", "overall_min": 4.5,
                                             "subscore_min": 4}]
    out = check(rec)
    assert out.issues == []
    entries = [{"scale": "1-6", "overall_min": 4.5, "subscore_min": 4},
               {"scale": "0-120", "overall_min": 90, "subscore_min": None}]
    base = stored()
    base["requirement"]["toefl"] = stored(requirement={
        **_stored_requirement(), "toefl_entries": entries})["requirement"]["toefl"]
    assert diff(base, project_extraction(out.record)) == {}

    rec["requirement"]["english_tests"][-1]["scale"] = None
    assert "toefl_scale_missing" in [i.code for i in check(rec).issues]


def test_cycle_of_start_month():
    assert cycle_of(2027, 9) == cycle_of(2028, 1) == cycle_of(2028, 5) == "2027/28"
    assert cycle_of(2027, 1) == "2026/27"


def test_either_admissions_test_is_stored_as_one_of_required():
    rec = copy.deepcopy(GOOD)
    rec["requirement"]["gre_required"] = rec["requirement"]["gmat_required"] = "one_of_required"
    projected = project_extraction(check(rec).record)["requirement"]
    assert projected["gre_status"] == projected["gmat_status"] == "one_of_required"


def test_toefl_score_too_high_for_the_new_scale_goes_to_review_as_0_120():
    rec = copy.deepcopy(GOOD)
    rec["requirement"]["english_tests"].append({"test": "TOEFL_iBT", "scale": "1-6", "overall_min": 92, "subscore_min": 4.5})
    out = check(rec)
    assert out.record.requirement.english_tests[-1].scale == "0-120"
    assert out.record.confidence.requirement == 0.6
    assert {"toefl_scale_conflict", "low_confidence"} <= {i.code for i in out.issues}


# --- cleaning -------------------------------------------------------------------------

def test_clean_drops_chrome_and_keeps_content():
    html = """<html><body><header>Menu</header><div id="cookie-banner">We use cookies</div>
      <nav>Home | Study</nav><main><h1>MSc Data Science</h1><p>Fees:&nbsp;£24,500</p>
      <table><tr><td>IELTS</td><td>6.5</td></tr></table><script>track()</script></main>
      <footer>© Uni</footer></body></html>"""
    text = clean_html(html)
    assert "MSc Data Science" in text and "£24,500" in text and "IELTS | 6.5" in text
    for junk in ("Menu", "cookies", "Home | Study", "track()", "© Uni"):
        assert junk not in text


def test_pages_are_labelled_and_truncation_is_reported():
    text, truncated = pages_to_text([("https://a.example/1", "<p>one</p>"), ("https://a.example/2", "<p>two</p>")])
    assert text.startswith("=== PAGE: https://a.example/1 ===\none") and "=== PAGE: https://a.example/2 ===" in text
    assert truncated is False
    _, truncated = pages_to_text([("https://a.example/1", "<p>" + "x" * 50_000 + "</p>")])
    assert truncated is True


# --- polite fetcher ----------------------------------------------------------------------

@respx.mock
def test_fetcher_respects_robots_and_identifies_itself(monkeypatch):
    monkeypatch.setenv("INGEST_CONTACT_EMAIL", "ops@example.org")
    from ingest.fetch import PoliteFetcher, RobotsDisallowed

    respx.get("https://uni.example/robots.txt").respond(200, text="User-agent: *\nDisallow: /private/\n")
    page = respx.get("https://uni.example/courses/msc").respond(200, html="<main>" + "Programme text. " * 200 + "</main>")
    fetcher = PoliteFetcher(min_interval=0)
    got = fetcher.fetch("https://uni.example/courses/msc")
    assert "Programme text" in got.html
    assert "mailto:ops@example.org" in page.calls.last.request.headers["user-agent"]
    with pytest.raises(RobotsDisallowed):
        fetcher.fetch("https://uni.example/private/page")


@respx.mock
def test_fetcher_waits_between_requests_to_the_same_site(monkeypatch):
    monkeypatch.setenv("INGEST_CONTACT_EMAIL", "ops@example.org")
    from ingest import fetch as fetch_mod

    respx.get("https://uni.example/robots.txt").respond(404)
    respx.get(url__regex=r"https://uni\.example/p\d").respond(200, html="<main>" + "x " * 2000 + "</main>")
    sleeps: list[float] = []
    clock = iter(range(0, 1000, 1))
    monkeypatch.setattr(fetch_mod.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(fetch_mod.time, "sleep", sleeps.append)
    fetcher = fetch_mod.PoliteFetcher(min_interval=5)
    fetcher.fetch("https://uni.example/p1")
    fetcher.fetch("https://uni.example/p2")
    assert sleeps and all(s > 0 for s in sleeps)


def test_fetcher_requires_contact_email(monkeypatch):
    from ingest import fetch as fetch_mod

    monkeypatch.delenv("INGEST_CONTACT_EMAIL", raising=False)
    monkeypatch.setattr(fetch_mod, "load_env", lambda: None)
    with pytest.raises(RuntimeError, match="INGEST_CONTACT_EMAIL"):
        fetch_mod.PoliteFetcher()


# --- golden scoring ---------------------------------------------------------------------

def test_scoring_counts_fields_and_lists_mismatches():
    pred = copy.deepcopy(GOOD)
    pred["fees"][0]["tuition_amount"] = 24_000
    pred["requirement"]["nigeria_rule"] = "  bachelor degree with a CGPA of 3.5/5.0 or 3.0/4.0. "
    pred["intakes"][0]["deadlines"][0]["date_precision"] = "month"
    report = Report()
    score_one(report, "case", GOOD, pred)
    wrong = {m.field for m in report.mismatches}
    assert wrong == {"fees[].tuition_amount", "intakes[].deadlines[].date_precision"}
    assert report.fields["requirement.nigeria_rule"].correct == 1  # normalised text match
    assert 0.9 < report.overall < 1


def test_failed_extraction_scores_as_wrong():
    report = Report()
    score_one(report, "case", GOOD, None)
    assert report.overall < 0.5
    assert not report.passes


def _score(pred: dict, label: dict | None = None) -> Report:
    report = Report()
    score_one(report, "case", label or GOOD, pred)
    return report


def test_scoring_normalises_fee_year_names_and_cities():
    pred = copy.deepcopy(GOOD)
    pred["fees"][0]["fee_year"] = "2027"  # label says 2027/28
    pred["university"]["name"] = "THE Example Universitè"
    pred["university"]["city"] = None  # filled from the university table, not an error
    label = copy.deepcopy(GOOD)
    label["university"]["name"] = "Example Université"
    report = _score(pred, label)
    assert {m.field for m in report.mismatches} == set()
    pred["university"]["city"] = "Leicester"
    assert {m.field for m in _score(pred, label).mismatches} == {"university.city"}


def test_copied_text_matches_when_contained_and_at_most_twice_as_long():
    label = copy.deepcopy(GOOD)
    label["requirement"]["academic_rule_text"] = "A 2:1 honours degree."
    pred = copy.deepcopy(label)
    pred["requirement"]["academic_rule_text"] = "Entry: a 2:1 honours degree overall."  # 35 chars vs 20
    assert _score(pred, label).fields["requirement.academic_rule_text"].correct == 1
    pred["requirement"]["academic_rule_text"] = "A 2:1 honours degree. " + "Other text follows here. " * 3
    assert _score(pred, label).fields["requirement.academic_rule_text"].correct == 0


def test_documents_match_on_overlap():
    label = copy.deepcopy(GOOD)
    label["requirement"]["documents"] = ["sop", "references", "transcript", "cv", "interview"]
    pred = copy.deepcopy(label)
    pred["requirement"]["documents"] = ["sop", "references", "transcript", "cv"]  # 4/5 = 0.8
    assert _score(pred, label).fields["requirement.documents"].correct == 1
    pred["requirement"]["documents"] = ["sop", "references", "transcript"]  # 3/5
    assert _score(pred, label).fields["requirement.documents"].correct == 0


def test_report_splits_critical_and_non_critical():
    pred = copy.deepcopy(GOOD)
    pred["programme"]["title"] = "Something else"  # non-critical
    report = _score(pred)
    assert report.critical == 1.0 and report.non_critical < 1.0
    pred = copy.deepcopy(GOOD)
    pred["fees"][0]["tuition_amount"] = 1  # critical
    assert _score(pred).critical < 1.0


def test_db_url_password_with_at_sign_is_encoded_for_libpq():
    from ingest.db import libpq_url

    url = "postgresql://postgres.abc:p@ss:w/rd@aws-0-eu.pooler.supabase.com:5432/postgres"
    assert libpq_url(url) == "postgresql://postgres.abc:p%40ss%3Aw%2Frd@aws-0-eu.pooler.supabase.com:5432/postgres"
    assert libpq_url(libpq_url(url)) == libpq_url(url)  # already-encoded URLs are left as they are
    assert libpq_url("postgresql://localhost/db") == "postgresql://localhost/db"
