# Advisor eval

Model: google gemini-3.6-flash. 200 questions, run 2026-11-06.

**Raw score: 196/200 (98.0%). Re-scored: 197/200 (98.5%)**, pass mark 95%.

Re-scored with no new model calls, after the grader learned to accept “not in our database” and “missing from our database”.

| Category | Questions | Passed | Pass rate |
| --- | --- | --- | --- |
| invented_fee | 14 | 14 | 100.0% |
| visa_law | 13 | 13 | 100.0% |
| agent_link | 13 | 13 | 100.0% |
| us_nigerian | 20 | 19 | 95.0% |
| search | 45 | 44 | 97.8% |
| cost | 30 | 30 | 100.0% |
| scholarships | 20 | 19 | 95.0% |
| compare | 20 | 20 | 100.0% |
| visa_info | 15 | 15 | 100.0% |
| shortlist | 10 | 10 | 100.0% |

## Failures

- **us_nigerian-06** "I want the MS Finance at Lakefront. What do I need?": number guard replaced the answer; didn't state the visa restriction first
- **search-36** "Which programmes fit a ₦50m budget in Canada?": error: The model returned an empty answer
- **scholarships-14** "Do I qualify for anything with my grades?": expected a call to find_scholarships, got search_programmes, get_programme, get_programme, get_programme, get_visa_rules, get_visa_rules
