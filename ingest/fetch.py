"""Polite fetching: robots.txt, one request per site every 5 seconds, identifying User-Agent.

docs/EXTRACTION.md section 5: "Respect robots.txt and each site's terms; one request per site
every 5 seconds; set a clear User-Agent with a contact email."
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx

from .env import load_env

MIN_INTERVAL_S = 5.0
BOT_NAME = "StudyBridgeBot"


class RobotsDisallowed(Exception):
    pass


class FetchError(Exception):
    pass


@dataclass
class FetchedPage:
    url: str
    final_url: str
    status: int
    html: str
    rendered: bool  # True when fetched with a headless browser


def user_agent() -> str:
    load_env()
    email = os.environ.get("INGEST_CONTACT_EMAIL", "").strip()
    if "@" not in email:
        raise RuntimeError("INGEST_CONTACT_EMAIL must be set (it goes in the User-Agent so site admins can reach us)")
    return f"{BOT_NAME}/0.1 (+mailto:{email}; study-programme data for students)"


class PoliteFetcher:
    def __init__(self, min_interval: float = MIN_INTERVAL_S, client: httpx.Client | None = None):
        self.min_interval = min_interval
        self._ua = user_agent()
        self._client = client or httpx.Client(
            headers={"User-Agent": self._ua, "Accept-Language": "en-GB,en;q=0.9"},
            follow_redirects=True,
            timeout=30,
        )
        self._robots: dict[str, RobotFileParser] = {}
        self._last_hit: dict[str, float] = {}
        self._lock = threading.Lock()

    # -- politeness -------------------------------------------------------------------
    def _wait_turn(self, host: str) -> None:
        with self._lock:
            wait = self._last_hit.get(host, 0) + self.min_interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_hit[host] = time.monotonic()

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        parser = self._robots.get(origin)
        if parser is None:
            parser = RobotFileParser()
            self._wait_turn(parts.netloc)
            try:
                resp = self._client.get(f"{origin}/robots.txt")
                if resp.status_code in (401, 403):
                    parser.disallow_all = True
                elif resp.status_code >= 400:
                    parser.allow_all = True
                else:
                    parser.parse(resp.text.splitlines())
            except httpx.HTTPError:
                # Unreachable robots.txt: be conservative and skip the site.
                parser.disallow_all = True
            self._robots[origin] = parser
        return parser.can_fetch(BOT_NAME, url)

    # -- fetching -----------------------------------------------------------------------
    def fetch(self, url: str, render_if_shorter_than: int = 2_000) -> FetchedPage:
        if not url.startswith("https://"):
            raise FetchError(f"Only https URLs are fetched: {url}")
        if not self.allowed(url):
            raise RobotsDisallowed(url)
        host = urlsplit(url).netloc
        self._wait_turn(host)
        try:
            resp = self._client.get(url)
        except httpx.HTTPError as err:
            raise FetchError(f"{url}: {err}") from err
        if resp.status_code >= 400:
            raise FetchError(f"{url}: HTTP {resp.status_code}")
        page = FetchedPage(url, str(resp.url), resp.status_code, resp.text, rendered=False)

        # Some programme pages render their content with JavaScript.
        from .clean import clean_html

        if len(clean_html(page.html)) < render_if_shorter_than:
            self._wait_turn(host)
            page = self._render(url)
        return page

    def _render(self, url: str) -> FetchedPage:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                ctx = browser.new_context(user_agent=self._ua, locale="en-GB")
                pg = ctx.new_page()
                resp = pg.goto(url, wait_until="networkidle", timeout=45_000)
                html = pg.content()
                return FetchedPage(url, pg.url, resp.status if resp else 0, html, rendered=True)
            finally:
                browser.close()

    def close(self) -> None:
        self._client.close()
