"""City of Kannapolis news, scraped from kannapolisnc.gov/news (no API).

Adapted from kspider (github.com/bradspry/kannapolis-news-wire) using the stdlib HTMLParser.
Each article is a <div class='article'> with articleHeadline / articleAuthor (date) / articleEntry.
"""
from __future__ import annotations

import datetime as dt
import html
import re
import time
import urllib.request
from html.parser import HTMLParser

from common import USER_AGENT, log, write_json

URL = "https://www.kannapolisnc.gov/news"
UA = USER_AGENT  # the City site accepts an honest, identifying User-Agent (checked 2026-11-18)
MAX_ITEMS = 100


def fetch(retries: int = 3) -> str:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(5 * attempt)
        try:
            req = urllib.request.Request(URL, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:
            last = e
    raise RuntimeError(f"Kannapolis news fetch failed: {last}")


class NewsParser(HTMLParser):
    """Collects {title, url, date, snippet} from each div.article."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items: list[dict] = []
        self.cur: dict | None = None
        self.depth = 0          # div depth inside the current article
        self.field: str | None = None
        self.field_depth = 0
        self.in_link = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = (a.get("class") or "").split()
        if tag == "div":
            if self.cur is None and "article" in classes:
                self.cur = {"title": "", "url": "", "date": "", "snippet": ""}
                self.depth = 1
                return
            if self.cur is not None:
                self.depth += 1
                if "articleAuthor" in classes:
                    self.field, self.field_depth = "date", self.depth
                elif "articleEntry" in classes:
                    self.field, self.field_depth = "snippet", self.depth
        elif tag == "a" and self.cur is not None and "/news/ID/" in (a.get("href") or "") and not self.cur["url"]:
            self.cur["url"] = a["href"]
            self.in_link = True
        elif tag in ("p", "br") and self.field == "snippet":
            self.cur["snippet"] += " "

    def handle_endtag(self, tag):
        if tag == "a":
            self.in_link = False
        if tag != "div" or self.cur is None:
            return
        if self.field and self.depth == self.field_depth:
            self.field = None
        self.depth -= 1
        if self.depth == 0:
            self.items.append(self.cur)
            self.cur = None

    def handle_data(self, data):
        if self.cur is None:
            return
        if self.in_link:
            self.cur["title"] += data
        elif self.field:
            self.cur[self.field] += data


def parse_date(text: str) -> str | None:
    try:
        return dt.datetime.strptime(text.strip(), "%m/%d/%Y").date().isoformat()
    except ValueError:
        return None


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


ARTICLE_START = re.compile(r"""<div\s+class=['"]article['"]\s*>""", re.I)


def parse(page: str) -> list[dict]:
    """Parse each article chunk on its own: the site truncates teasers mid-markup, which
    leaves unclosed tags that would otherwise swallow every following article."""
    found = []
    for chunk in ARTICLE_START.split(page)[1:]:
        p = NewsParser()
        p.feed("<div class='article'>" + chunk)
        p.close()
        if p.cur is not None:  # article never closed cleanly; keep what we have
            p.items.append(p.cur)
        found.extend(p.items[:1])
    return found


def main():
    items = []
    for it in parse(fetch()):
        title, url = clean(it["title"]), it["url"].strip()
        if not title or not url:
            continue
        if url.startswith("/"):
            url = "https://www.kannapolisnc.gov" + url
        snippet = clean(it["snippet"])
        items.append({
            "title": title,
            "url": url,
            "date": parse_date(it["date"]),
            # The site truncates teasers with "..."; normalize to a single ellipsis.
            "snippet": re.sub(r"\s*\.{3,}$", "…", snippet) or None,
        })
    if not items:
        raise RuntimeError("No articles found; the City's news page layout may have changed.")
    items.sort(key=lambda x: x["date"] or "", reverse=True)
    items = items[:MAX_ITEMS]
    log(f"news: {len(items)} articles, newest {items[0]['date']}, oldest {items[-1]['date']}")
    write_json("news.json", {"source": URL, "items": items})


if __name__ == "__main__":
    main()
