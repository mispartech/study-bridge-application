import json
import os
from types import SimpleNamespace

import pytest

os.environ["AI_USAGE_LOGGING"] = "off"
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("OPENROUTER_API_KEY", "test-key")

from ingest import ai  # noqa: E402
from ingest.ai import AiValidationError, ModelRef, generate_structured, model_for, render_prompt  # noqa: E402

SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "required": ["found", "fee", "deadline"],
    "properties": {
        "found": {"type": "boolean"},
        "fee": {"type": ["number", "null"], "minimum": 0},
        "deadline": {"type": ["string", "null"], "format": "date"},
    },
}


def tool_response(args: dict, name: str = "record_programme"):
    call = SimpleNamespace(function=SimpleNamespace(name=name, arguments=json.dumps(args)))
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(tool_calls=[call], content=None))],
        usage=SimpleNamespace(prompt_tokens=100, completion_tokens=20),
    )


@pytest.fixture
def captured(monkeypatch):
    calls: list[dict] = []

    def install(response):
        def fake_completion(**kwargs):
            calls.append(kwargs)
            return response

        monkeypatch.setattr(ai.litellm, "completion", fake_completion)
        return calls

    return install


def test_config_and_model_refs():
    assert model_for("extraction") == ModelRef("anthropic", "claude-haiku-5-5")
    assert ModelRef.parse("gemini:gemini-3.6-flash") == ModelRef("google", "gemini-3.6-flash")
    with pytest.raises(ValueError):
        ModelRef.parse("claude-haiku-5-5")


def test_forced_tool_call_on_haiku(captured):
    calls = captured(tool_response({"found": True, "fee": 24500, "deadline": "2027-06-30"}))
    result = generate_structured("extraction", "prompt", SCHEMA, tool_name="record_programme")
    assert result.data == {"found": True, "fee": 24500, "deadline": "2027-06-30"}
    assert (result.input_tokens, result.output_tokens) == (100, 20)
    sent = calls[0]
    assert sent["model"] == "anthropic/claude-haiku-5-5"
    assert sent["tool_choice"] == {"type": "function", "function": {"name": "record_programme"}}
    assert "$schema" not in sent["tools"][0]["function"]["parameters"]
    assert sent["thinking"] == {"type": "disabled"}
    assert "temperature" not in sent  # Anthropic rejects sampling params


def test_other_providers_get_temperature_zero(captured):
    calls = captured(tool_response({"found": False, "fee": None, "deadline": None}))
    generate_structured("extraction", "p", SCHEMA, tool_name="record_programme",
                        model=ModelRef("openrouter", "deepseek/deepseek-v4.1-flash"))
    assert calls[0]["model"] == "openrouter/deepseek/deepseek-v4.1-flash"
    assert calls[0]["temperature"] == 0
    assert "thinking" not in calls[0]


def test_native_structured_output_where_forced_tools_are_rejected(captured):
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(tool_calls=None, content='{"found": true, "fee": 1, "deadline": null}'))],
        usage=None,
    )
    calls = captured(response)
    result = generate_structured("advisor", "p", SCHEMA)
    assert result.data["found"] is True
    assert calls[0]["response_format"]["type"] == "json_schema"
    assert "tool_choice" not in calls[0]


@pytest.mark.parametrize(
    "bad",
    [
        {"found": "yes", "fee": 1, "deadline": None},
        {"found": True, "fee": -5, "deadline": None},
        {"found": True, "fee": 1, "deadline": "30 June 2027"},
        {"found": True, "fee": 1, "deadline": None, "extra": 1},
    ],
)
def test_schema_violations_are_rejected(captured, bad):
    captured(tool_response(bad))
    with pytest.raises(AiValidationError):
        generate_structured("extraction", "p", SCHEMA, tool_name="record_programme")


def test_missing_key_is_reported(monkeypatch, captured):
    captured(tool_response({}))
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(ai, "load_env", lambda: None)
    with pytest.raises(ai.MissingApiKeyError, match="GEMINI_API_KEY"):
        generate_structured("extraction", "p", SCHEMA, model=ModelRef("google", "gemini-3.6-flash"))


def test_render_prompt_and_r3_placeholders():
    assert render_prompt("Hi {{a}}", {"a": 1}) == "Hi 1"
    with pytest.raises(KeyError):
        render_prompt("Hi {{a}}", {})
    text = ai.load_prompt("r3_extraction", {"target_title": "MSc X", "target_intake_year": 2027, "page_text": "PAGES"})
    assert text.startswith("You extract structured data")
    assert text.endswith("Target intake year: 2027\nPages:\nPAGES")
