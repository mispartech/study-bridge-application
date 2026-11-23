"""HTML → readable text for extraction: drop navigation, footers, cookie banners and scripts."""

from __future__ import annotations

import re

from selectolax.lexbor import LexborHTMLParser as HTMLParser

MAX_CHARS = 40_000  # docs/EXTRACTION.md section 1: "max ~40k characters"

DROP_TAGS = ["script", "style", "noscript", "template", "svg", "iframe", "nav", "footer", "header", "aside", "form",
             "button", "dialog"]
# id/class fragments of cookie banners, menus and other page chrome.
CHROME = re.compile(r"cookie|consent|gdpr|onetrust|banner|breadcrumb|skip-link|site-header|site-footer|megamenu|navbar",
                    re.I)
BLOCK_TAGS = {"p", "div", "section", "article", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "dt", "dd", "br",
              "table", "ul", "ol", "main", "summary", "details", "caption"}


# Never code: removed outright, before measuring how much text the page has.
CODE_TAGS = ["script", "style", "noscript", "template", "svg"]
# A chrome rule never removes an element holding more than this share of the page's text. Some sites wrap the
# whole page in one <form> (ASP.NET) or mark their main content with a footer role; dropping those empties the page.
MAX_DROP_SHARE = 0.5


def _text_len(node) -> int:
    return len(node.text(separator=" ").strip())


def clean_html(html: str) -> str:
    tree = HTMLParser(html)
    for tag in CODE_TAGS:
        for node in tree.css(tag):
            node.decompose()
    page = tree.body or tree.root
    total = _text_len(page) if page is not None else 0

    def droppable(node) -> bool:
        return total == 0 or _text_len(node) <= total * MAX_DROP_SHARE

    for tag in DROP_TAGS:
        if tag in CODE_TAGS:
            continue
        for node in tree.css(tag):
            if droppable(node):
                node.decompose()
    for node in tree.css("[id], [class], [role], [aria-label]"):
        attrs = " ".join(filter(None, (node.attributes.get(a) for a in ("id", "class", "role", "aria-label"))))
        if node.tag in ("html", "body", "main"):
            continue  # page-level wrappers sometimes carry "nav"-like classes; never drop the whole page
        chrome = CHROME.search(attrs) or node.attributes.get("role") in ("navigation", "banner", "contentinfo")
        if chrome and droppable(node):
            node.decompose()

    root = tree.css_first("main") or tree.body or tree.root
    if root is None:
        return ""
    parts: list[str] = []
    for node in root.traverse(include_text=True):
        if node.tag == "-text":
            parts.append(node.text_content or "")
        elif node.tag in BLOCK_TAGS:
            parts.append("\n")
        elif node.tag in ("td", "th"):
            parts.append(" | ")
    text = "".join(parts)
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def pages_to_text(pages: list[tuple[str, str]], max_chars: int = MAX_CHARS) -> tuple[str, bool]:
    """Joins cleaned pages, each under a `=== PAGE: <url> ===` line. Returns (text, truncated)."""
    text = "\n\n".join(f"=== PAGE: {url} ===\n{clean_html(html)}" for url, html in pages)
    if len(text) <= max_chars:
        return text, False
    return text[:max_chars], True
