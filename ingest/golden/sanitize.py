"""Removes scripts and credentials from saved golden pages. The golden set only needs page text, and
third-party scripts carry API keys. Run over the saved pages with `python -m ingest.golden.sanitize`.
"""

from __future__ import annotations

import re
import sys

from .run import GOLDEN

SCRIPT = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.I | re.S)
CREDENTIAL_PARAM = re.compile(r"([?&](?:amp;)?(?:api[_-]?key|apikey|key|token|access_token|secret)=)[^&\"'\s<>]+", re.I)
KNOWN_KEY = re.compile(r"AIza[0-9A-Za-z_-]{35}|AKIA[0-9A-Z]{16}|gh[pousr]_[0-9A-Za-z]{36}|xox[baprs]-[0-9A-Za-z-]{10,}"
                       r"|sk-(?:ant|or|proj)-[0-9A-Za-z_-]{20,}|eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}")
REDACTED = "REDACTED"


def sanitize_html(html: str) -> str:
    html = SCRIPT.sub("", html)
    html = CREDENTIAL_PARAM.sub(rf"\g<1>{REDACTED}", html)
    return KNOWN_KEY.sub(REDACTED, html)


def main() -> int:
    changed = 0
    for path in sorted((GOLDEN / "pages").glob("*.html")):
        raw = path.read_bytes().decode("utf-8")
        clean = sanitize_html(raw)
        if clean != raw:
            path.write_bytes(clean.encode("utf-8"))
            changed += 1
    print(f"sanitized {changed} pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
