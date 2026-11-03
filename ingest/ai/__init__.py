"""Provider-agnostic AI adapter for the ingestion service (LiteLLM).

Same contract as lib/ai in TypeScript:
  generate_structured(task, prompt, schema) -> validated JSON (forced tool call or native structured output)
  generate_text(task, messages, tools=None) -> streamed text chunks (and tool calls)

The model per task comes from config/ai.json; API keys only from environment variables.
"""

from __future__ import annotations

import copy
import json
import os
import re
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

import litellm
from jsonschema import Draft202012Validator, FormatChecker

from ..env import REPO_ROOT, load_env
from .usage import log_usage

CONFIG_PATH = REPO_ROOT / "config" / "ai.json"
PROMPTS_DIR = REPO_ROOT / "prompts"

PROVIDER_KEY_ENV = {
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}
# LiteLLM's prefix for each provider.
LITELLM_PREFIX = {"anthropic": "anthropic", "google": "gemini", "openai": "openai", "openrouter": "openrouter"}

# Models that reject forced tool calls; they use native structured output instead.
NO_FORCED_TOOL = re.compile(r"^claude-(sonnet-5-5|opus-5-5|fable-5-1|mythos-5-1)")

litellm.drop_params = False  # fail loudly rather than silently dropping a parameter
litellm.suppress_debug_info = True


@dataclass(frozen=True)
class ModelRef:
    provider: str
    model: str

    @staticmethod
    def parse(spec: str) -> "ModelRef":
        """Parses "provider:model", e.g. "openrouter:deepseek/deepseek-v4.1-flash"."""
        provider, sep, model = spec.partition(":")
        if not sep or not provider or not model:
            raise ValueError(f'Expected "provider:model", got "{spec}"')
        return ModelRef(_provider(provider), model)

    @property
    def label(self) -> str:
        return f"{self.provider}:{self.model}"


def _provider(name: str) -> str:
    name = "google" if name == "gemini" else name
    if name not in PROVIDER_KEY_ENV:
        raise ValueError(f"Unknown provider {name!r}; expected one of {sorted(PROVIDER_KEY_ENV)}")
    return name


def model_for(task: str) -> ModelRef:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if task not in config:
        raise KeyError(f"No model configured for task {task!r} in config/ai.json")
    entry = config[task]
    return ModelRef(_provider(entry["provider"]), entry["model"])


def render_prompt(template: str, values: dict[str, Any]) -> str:
    """Replaces every {{name}}; raises on missing or unknown values so templates can't drift."""
    used: set[str] = set()

    def sub(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in values:
            raise KeyError(f"Prompt placeholder {{{{{name}}}}} has no value")
        used.add(name)
        return str(values[name])

    out = re.sub(r"\{\{(\w+)\}\}", sub, template)
    unused = set(values) - used
    if unused:
        raise KeyError(f"Values given for unknown placeholders: {', '.join(sorted(unused))}")
    return out


def load_prompt(name: str, values: dict[str, Any]) -> str:
    template = (PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8").replace("\r\n", "\n").removesuffix("\n")
    return render_prompt(template, values)


class AiValidationError(Exception):
    def __init__(self, message: str, errors: list[str], raw: Any):
        super().__init__(message)
        self.errors = errors
        self.raw = raw


class MissingApiKeyError(RuntimeError):
    pass


@dataclass
class StructuredResult:
    data: Any
    model: ModelRef
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: int
    warnings: list[str] = field(default_factory=list)


def supports_forced_tool(ref: ModelRef) -> bool:
    return not (ref.provider == "anthropic" and NO_FORCED_TOOL.match(ref.model))


def _api_key(ref: ModelRef) -> str:
    load_env()
    key = os.environ.get(PROVIDER_KEY_ENV[ref.provider])
    if not key:
        raise MissingApiKeyError(f'{PROVIDER_KEY_ENV[ref.provider]} is not set; it is required for "{ref.provider}".')
    return key


def _for_provider(schema: dict[str, Any]) -> dict[str, Any]:
    """Drops document-only keywords that some providers reject."""
    out = copy.deepcopy(schema)
    out.pop("$schema", None)
    return out


def _request_params(ref: ModelRef, forced: bool) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if ref.provider == "anthropic":
        # Anthropic's current API rejects sampling parameters; a forced tool call can't run
        # with thinking, which claude-haiku-5-5 allows switching off.
        if forced:
            params["thinking"] = {"type": "disabled"}
    else:
        params["temperature"] = 0
    return params


def _usage(response: Any) -> tuple[int | None, int | None]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None, None
    return getattr(usage, "prompt_tokens", None), getattr(usage, "completion_tokens", None)


def generate_structured(
    task: str,
    prompt: str,
    schema: dict[str, Any],
    *,
    tool_name: str = "record",
    tool_description: str | None = None,
    model: ModelRef | None = None,
    user_id: str | None = None,
    max_tokens: int = 16_000,
    timeout: float = 180,
) -> StructuredResult:
    """One structured generation validated against `schema` (draft 2020-12).

    Forced tool call named `tool_name` where the model allows it, otherwise native
    structured output. Raises AiValidationError when the JSON does not match the schema.
    """
    ref = model or model_for(task)
    forced = supports_forced_tool(ref)
    started = time.perf_counter()
    in_tok = out_tok = None
    try:
        kwargs: dict[str, Any] = {
            "model": f"{LITELLM_PREFIX[ref.provider]}/{ref.model}",
            "messages": [{"role": "user", "content": prompt}],
            "api_key": _api_key(ref),
            "max_tokens": max_tokens,
            "timeout": timeout,
            **_request_params(ref, forced),
        }
        provider_schema = _for_provider(schema)
        if forced:
            function: dict[str, Any] = {"name": tool_name, "parameters": provider_schema}
            if tool_description:
                function["description"] = tool_description
            kwargs["tools"] = [{"type": "function", "function": function}]
            kwargs["tool_choice"] = {"type": "function", "function": {"name": tool_name}}
        else:
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": tool_name, "schema": provider_schema},
            }

        response = litellm.completion(**kwargs)
        in_tok, out_tok = _usage(response)
        message = response.choices[0].message
        if forced:
            calls = [c for c in (message.tool_calls or []) if c.function.name == tool_name]
            if not calls:
                raise AiValidationError(f"Model did not call {tool_name}", [], message.content)
            raw_text = calls[0].function.arguments
        else:
            raw_text = message.content
        try:
            data = json.loads(raw_text) if isinstance(raw_text, str) else raw_text
        except json.JSONDecodeError as err:
            raise AiValidationError(f"Model returned invalid JSON: {err}", [str(err)], raw_text) from err

        errors = [
            f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
            for e in Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(data)
        ]
        if errors:
            raise AiValidationError(f"Output does not match schema ({len(errors)} errors)", errors, data)

        latency_ms = int((time.perf_counter() - started) * 1000)
        log_usage(task=task, ref=ref, input_tokens=in_tok, output_tokens=out_tok, latency_ms=latency_ms, success=True,
                  user_id=user_id)
        return StructuredResult(data, ref, in_tok, out_tok, latency_ms)
    except Exception as err:
        log_usage(task=task, ref=ref, input_tokens=in_tok, output_tokens=out_tok,
                  latency_ms=int((time.perf_counter() - started) * 1000), success=False, error=str(err),
                  user_id=user_id)
        raise


@dataclass
class TextChunk:
    text: str = ""
    tool_calls: list[Any] = field(default_factory=list)


def generate_text(
    task: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    *,
    model: ModelRef | None = None,
    user_id: str | None = None,
    max_tokens: int = 16_000,
) -> Iterator[TextChunk]:
    """Streams text deltas (and tool-call deltas); usage is logged when the stream ends."""
    ref = model or model_for(task)
    started = time.perf_counter()
    in_tok = out_tok = None
    try:
        stream = litellm.completion(
            model=f"{LITELLM_PREFIX[ref.provider]}/{ref.model}",
            messages=messages,
            tools=tools,
            api_key=_api_key(ref),
            max_tokens=max_tokens,
            stream=True,
            stream_options={"include_usage": True},
        )
        for chunk in stream:
            if getattr(chunk, "usage", None):
                in_tok, out_tok = _usage(chunk)
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content or delta.tool_calls:
                yield TextChunk(text=delta.content or "", tool_calls=list(delta.tool_calls or []))
        log_usage(task=task, ref=ref, input_tokens=in_tok, output_tokens=out_tok,
                  latency_ms=int((time.perf_counter() - started) * 1000), success=True, user_id=user_id)
    except Exception as err:
        log_usage(task=task, ref=ref, input_tokens=in_tok, output_tokens=out_tok,
                  latency_ms=int((time.perf_counter() - started) * 1000), success=False, error=str(err),
                  user_id=user_id)
        raise
