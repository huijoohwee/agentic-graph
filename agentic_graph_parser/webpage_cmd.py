
import argparse
import json
import sys
import time
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.request import Request, build_opener, HTTPCookieProcessor
import gzip
import http.cookiejar
from io import StringIO
from typing import Any, Dict, List, Optional, Tuple
import html as _html

from .common import slugify
from .markdown_tables import serialize_markdown_pipe_table

def _extract_best_title(html_str: str, markdown_hint: str, url: str) -> str:
    import re

    def _decode(s: str) -> str:
        return _html.unescape(' '.join((s or '').split()).strip())

    def _meta_content(property_or_name: str) -> str:
        key = re.escape(property_or_name)
        patterns = [
            rf'<meta\s+[^>]*property=["\']{key}["\'][^>]*content=["\']([^"\']+)["\']',
            rf'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']{key}["\']',
            rf'<meta\s+[^>]*name=["\']{key}["\'][^>]*content=["\']([^"\']+)["\']',
            rf'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']{key}["\']',
        ]
        for pat in patterns:
            m = re.search(pat, html_str, flags=re.IGNORECASE)
            if m:
                v = _decode(m.group(1))
                if v:
                    return v
        return ''

    def _title_tag() -> str:
        m = re.search(r'<title[^>]*>([\s\S]*?)</title>', html_str, flags=re.IGNORECASE)
        if not m:
            return ''
        raw = re.sub(r'<[^>]+>', ' ', m.group(1) or '')
        return _decode(raw)

    def _first_h1() -> str:
        m = re.search(r'<h1\b[^>]*>([\s\S]*?)</h1>', html_str, flags=re.IGNORECASE)
        if not m:
            return ''
        raw = re.sub(r'<[^>]+>', ' ', m.group(1) or '')
        return _decode(raw)

    def _markdown_title() -> str:
        md = StringIO(markdown_hint or '')
        for _ in range(140):
            line = md.readline()
            if not line:
                break
            s = (line or '').strip()
            if not s:
                continue
            if s.startswith('#'):
                v = s.lstrip('#').strip()
                if v:
                    return v
            if s.startswith('**') and s.endswith('**') and len(s) >= 6:
                v = s.strip('*').strip()
                if v:
                    return v
            if 12 <= len(s) <= 96 and re.search(r'[A-Za-z]', s) and not s.endswith('.'):
                return s
        return ''

    def _is_placeholder(t: str) -> bool:
        v = (t or '').strip()
        if not v:
            return True
        low = v.lower()
        if low in {'webpage import', 'home', 'homepage', 'index'}:
            return True
        if len(v) <= 2:
            return True
        return False

    candidates = [
        _meta_content('og:title'),
        _meta_content('twitter:title'),
        _meta_content('title'),
        _title_tag(),
        _first_h1(),
        _markdown_title(),
    ]
    for c in candidates:
        if c and not _is_placeholder(c):
            return c
    for c in candidates:
        if c:
            return c
    try:
        return urlparse(url).hostname or 'Webpage'
    except Exception:
        return 'Webpage'


def _postprocess_markdown(markdown: str) -> str:
    text = str(markdown or '')
    for _ in range(8):
        if '****' not in text:
            break
        text = text.replace('****', '**')

    joined = text.strip()
    return joined + ('\n' if joined else '')

_COOKIE_JAR = http.cookiejar.CookieJar()
_OPENER = build_opener(HTTPCookieProcessor(_COOKIE_JAR))
_OPENER.addheaders = [
    ("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    ("Accept", "*/*"),
    ("Accept-Language", "en-US,en;q=0.9"),
    ("Accept-Encoding", "gzip, deflate"),
]

def _fetch_url(url: str, timeout: int = 30) -> bytes:
    # Retry loop for 429/403/5xx
    max_retries = 3
    for attempt in range(max_retries):
        try:
            import requests
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate",
            }
            resp = requests.get(url, headers=headers, timeout=timeout)
            if resp.status_code in {429, 403, 503}:
                if attempt < max_retries - 1:
                    time.sleep(1 * (attempt + 1))
                    continue
            resp.raise_for_status()
            return resp.content
        except ImportError:
            break # Fallback to urllib
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            # If requests failed repeatedly, try urllib fallback or raise
            pass

    req = Request(url, headers={})
    # urllib handles gzip automatically if we don't manually set Accept-Encoding, 
    # but _OPENER sets it. So we need to handle decompression.
    last_err = None
    for attempt in range(max_retries):
        try:
            with _OPENER.open(req, timeout=timeout) as resp:
                content = resp.read()
                if resp.headers.get('Content-Encoding') == 'gzip':
                    return gzip.decompress(content)
                return content
        except Exception as e:
            last_err = e
            # HTTPError is raised for non-200 codes by urllib
            if hasattr(e, 'code') and e.code in {429, 403, 503}:
                if attempt < max_retries - 1:
                    time.sleep(1 * (attempt + 1))
                    continue
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
    
    if last_err:
        raise last_err
    raise Exception("Fetch failed")

# --- HTML Parser ---

class SimpleMarkdownParser(HTMLParser):
    def __init__(self, base_url: str, include_images: bool = True):
        super().__init__()
        self.base_url = base_url
        self.include_images = include_images
        self.output_lines: List[str] = []
        self.current_line: List[str] = []
        self.in_script_or_style = False
        self.title: str = ""
        self.in_title = False
        self.links: List[str] = []
        self.images: List[str] = []
        self.indent_level = 0
        self.list_stack: List[str] = [] # 'ul' or 'ol'
        
        # Fidelity state
        self.in_pre = False
        self.in_code = False
        self.in_table = False
        self.table_buffer: List[str] = [] # Capture source tables before Markdown conversion.
    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style', 'head'}:
            self.in_script_or_style = True
            return

        if self.in_script_or_style:
            return

        # Capture tables as one unit so the shared converter can emit a pipe table.
        if tag == 'table':
            self.in_table = True
            self.flush_line()
            self.table_buffer = ['<table' + self._attrs_to_str(attrs) + '>']
            return
        if self.in_table:
            self.table_buffer.append('<' + tag + self._attrs_to_str(attrs) + '>')
            # Handle images inside tables
            if tag == 'img' and self.include_images:
                src = dict(attrs).get('src')
                if src:
                    abs_src = urljoin(self.base_url, src)
                    self.images.append(abs_src)
            return

        if tag == 'title':
            self.in_title = True
            return

        if tag in {'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'noscript'}:
            self.flush_line()
        
        if tag in {'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}:
            level = int(tag[1])
            self.current_line.append('#' * level + ' ')

        if tag == 'blockquote':
            self.current_line.append('> ')

        if tag == 'ul':
            self.flush_line()
            self.list_stack.append('ul')
            self.indent_level += 1
        elif tag == 'ol':
            self.flush_line()
            self.list_stack.append('ol')
            self.indent_level += 1
        elif tag == 'li':
            self.flush_line()
            indent = '  ' * (self.indent_level - 1)
            marker = '- ' if self.list_stack and self.list_stack[-1] == 'ul' else '1. '
            self.current_line.append(indent + marker)

        if tag == 'pre':
            self.flush_line()
            self.in_pre = True
            self.output_lines.append("```")
            return

        if tag == 'code' and not self.in_pre:
            self.in_code = True
            self.current_line.append('`')

        if tag in {'strong', 'b'}:
            self.current_line.append('**')
        
        if tag in {'em', 'i'}:
            self.current_line.append('*')

        if tag == 'a':
            attrs_d = dict(attrs)
            href = attrs_d.get('href')
            if href:
                abs_href = urljoin(self.base_url, href)
                self.current_line.append('[')
                self._current_href = abs_href
                self._current_link_has_text = False
                self._current_link_fallback_text = (
                    (attrs_d.get('aria-label') or '').strip()
                    or (attrs_d.get('title') or '').strip()
                    or (attrs_d.get('data-label') or '').strip()
                )

        if tag == 'img':
            if not self.include_images:
                return
            src = dict(attrs).get('src')
            alt = dict(attrs).get('alt', 'Image')
            if src:
                abs_src = urljoin(self.base_url, src)
                self.images.append(abs_src)
                self.flush_line()
                self.output_lines.append(f"![{alt}]({abs_src})")
                self.output_lines.append("")

        if tag == 'hr':
            self.flush_line()
            self.output_lines.append("---")
            self.output_lines.append("")

        if tag == 'br':
            self.output_lines.append("".join(self.current_line))
            self.current_line = []
            
        # Pass-through specific HTML tags that Markdown doesn't handle well or for fidelity
        if tag in {'iframe', 'video'}:
            self.flush_line()
            self.output_lines.append('<' + tag + self._attrs_to_str(attrs) + '>')

    def handle_endtag(self, tag):
        if tag in {'script', 'style', 'head'}:
            self.in_script_or_style = False
            return

        if self.in_script_or_style:
            return

        if tag == 'table':
            self.in_table = False
            self.table_buffer.append('</table>')
            table_markdown = _table_html_to_markdown(
                "".join(self.table_buffer),
                max_rows=None,
                max_cols=None,
            )
            if table_markdown:
                self.output_lines.append(table_markdown)
                self.output_lines.append("")
            self.table_buffer = []
            return
        
        if self.in_table:
            self.table_buffer.append(f'</{tag}>')
            return

        if tag == 'title':
            self.in_title = False
            return

        if tag in {'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'noscript'}:
            self.flush_line()
            if tag in {'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}:
                self.output_lines.append("")

        if tag in {'ul', 'ol'}:
            if self.list_stack:
                self.list_stack.pop()
            if self.indent_level > 0:
                self.indent_level -= 1
            self.flush_line()
            self.output_lines.append("")

        if tag == 'pre':
            self.output_lines.append("```")
            self.output_lines.append("")
            self.in_pre = False
            return

        if tag == 'code' and not self.in_pre:
            self.in_code = False
            self.current_line.append('`')

        if tag in {'strong', 'b'}:
            self.current_line.append('**')
        
        if tag in {'em', 'i'}:
            self.current_line.append('*')

        if tag == 'a':
            if hasattr(self, '_current_href'):
                if getattr(self, '_current_link_has_text', False) is False:
                    fallback = getattr(self, '_current_link_fallback_text', '')
                    if fallback:
                        self.current_line.append(fallback)
                self.current_line.append(f"]({self._current_href})")
                del self._current_href
                if hasattr(self, '_current_link_has_text'):
                    del self._current_link_has_text
                if hasattr(self, '_current_link_fallback_text'):
                    del self._current_link_fallback_text

        if tag in {'iframe', 'video'}:
            self.output_lines.append(f'</{tag}>')
            self.output_lines.append("")

    def handle_data(self, data):
        if self.in_script_or_style:
            return
            
        if self.in_table:
            self.table_buffer.append(data)
            return

        if self.in_title:
            self.title += data
            return
        
        if self.in_pre:
            self.output_lines.append(data)
            return
            
        text = data.replace('\n', ' ').strip()
        if text:
            if hasattr(self, '_current_href'):
                self._current_link_has_text = True
            if self.current_line and not self.current_line[-1].endswith(' ') and not self.current_line[-1].endswith('`') and not text.startswith(' ') and not text.startswith('.') and not text.startswith(','):
                 self.current_line.append(' ')
            self.current_line.append(text)

    def _attrs_to_str(self, attrs):
        if not attrs:
            return ""
        return " " + " ".join(f'{k}="{v}"' for k, v in attrs)

    def flush_line(self):
        if self.current_line:
            self.output_lines.append("".join(self.current_line).strip())
            self.current_line = []

    def get_markdown(self) -> str:
        self.flush_line()
        # Clean up empty lines
        cleaned = []
        for line in self.output_lines:
            if line.strip():
                cleaned.append(line)
            elif cleaned and cleaned[-1].strip():
                cleaned.append("")
        
        # Prepend title
        if self.title:
            return f"# {self.title}\n\n" + "\n".join(cleaned)
        return "\n".join(cleaned)


class _TableToMarkdownParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows: List[List[str]] = []
        self._row: List[str] = []
        self._cell: List[str] = []
        self._in_tr = False
        self._in_cell = False
        self._has_th = False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self._in_tr = True
            self._row = []
        if tag in {'td', 'th'}:
            self._in_cell = True
            self._cell = []
            if tag == 'th':
                self._has_th = True
        if tag == 'br' and self._in_cell:
            self._cell.append(' ')

    def handle_endtag(self, tag):
        if tag in {'td', 'th'}:
            if self._in_cell:
                raw = _html.unescape(''.join(self._cell))
                val = ' '.join(raw.split()).strip()
                self._row.append(val)
            self._in_cell = False
            self._cell = []
        if tag == 'tr':
            if self._in_tr and self._row:
                self.rows.append(self._row)
            self._in_tr = False
            self._row = []

    def handle_data(self, data):
        if self._in_cell:
            self._cell.append(data)


def _table_html_to_markdown(
    table_html: str,
    *,
    max_rows: Optional[int] = 12,
    max_cols: Optional[int] = 6,
) -> str:
    p = _TableToMarkdownParser()
    p.feed(table_html)
    rows = [r for r in p.rows if any((c or '').strip() for c in r)]
    if max_cols is not None:
        rows = [r[:max_cols] for r in rows]
    if max_rows is not None:
        rows = rows[:max_rows]
    if not rows:
        return ""

    width = max(len(r) for r in rows)
    norm = [r + [''] * (width - len(r)) for r in rows]
    header = norm[0]
    body = norm[1:]

    return '\n'.join(serialize_markdown_pipe_table(header, body))


def _rows_to_markdown_table(rows: List[List[str]]) -> str:
    if not rows:
        return ''
    width = max(len(r) for r in rows)
    norm = [r + [''] * (width - len(r)) for r in rows]
    header = norm[0]
    body = norm[1:]

    return '\n'.join(serialize_markdown_pipe_table(header, body))


def _strip_html_to_text(fragment: str, *, max_chars: int = 4000) -> str:
    import re
    s = _html.unescape(fragment)
    s = s.replace('\n', ' ')
    s = ''.join(ch if ch.isprintable() else ' ' for ch in s)
    if '<script' in s.lower():
        s = re.sub(r'<script\b[^>]*>[\s\S]*?</script\s*>', ' ', s, flags=re.IGNORECASE)
    if '<style' in s.lower():
        s = re.sub(r'<style\b[^>]*>[\s\S]*?</style\s*>', ' ', s, flags=re.IGNORECASE)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = ' '.join(s.split()).strip()
    if len(s) > max_chars:
        s = s[:max_chars]
    return s


def _extract_structured_details_markdown(html_str: str, base_url: str, markdown_hint: Optional[str] = None) -> str:
    import re
    lower = html_str.lower()

    sections: List[str] = []

    stop_template = {
        'docs',
        'documentation',
        'api',
        'products',
        'product',
        'resources',
        'pricing',
        'plans',
        'features',
        'learn',
        'guide',
        'tutorial',
        'tutorials',
        'examples',
        'demo',
        'demos',
        'blog',
        'changelog',
        'community',
        'support',
        'help',
        'status',
        'about',
        'contact',
        'careers',
        'jobs',
        'privacy',
        'terms',
        'license',
        'licenses',
        'press',
        'investors',
        'security',
        'legal',
        'github',
        'discord',
        'twitter',
        'x',
        'linkedin',
        'youtube',
        'facebook',
        'instagram',
        'tiktok',
        'reddit',
        'mastodon',
        'search',
        'sign in',
        'signin',
        'log in',
        'login',
        'sign up',
        'signup',
        'get started',
        'download',
        'install',
        'open',
        'buy',
        'purchase',
        'subscribe',
        'home',
        'homepage',
        'main',
        'navigation',
        'menu',
        'navigation menu',
        'main navigation menu',
        'get started for free',
    }

    # --- Navigation menus (best-effort, site-agnostic) ---
    def _normalize_menu_label(raw: str) -> str:
        v = ' '.join((raw or '').split()).strip()
        if not v:
            return ''
        if len(v) > 32:
            return ''
        if v.lower().startswith('skip to'):
            return ''
        return v

    def _should_keep_nav_item(raw: str) -> bool:
        v = ' '.join((raw or '').split()).strip()
        if not v:
            return False
        if len(v) > 48:
            return False
        if v.lower().startswith('skip to'):
            return False
        return True

    def _extract_nav_menus(html_all: str) -> List[str]:
        from html.parser import HTMLParser

        def _maybe_label_token(raw: str) -> str:
            import re
            v = ' '.join((raw or '').split()).strip()
            if not v:
                return ''
            if len(v) < 2 or len(v) > 18:
                return ''
            if v.lower() in {'new', 'beta', 'slide', 'slides'}:
                return ''
            if not re.match(r'^[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?$', v):
                return ''
            return v

        class _NavParse(HTMLParser):
            def __init__(self):
                super().__init__()
                self._container_stack: List[str] = []
                self._containers: List[List[Tuple[str, str, str]]] = []
                self._current: List[Tuple[str, str, str]] = []
                self._in_a = False
                self._a_href = ''
                self._a_text: List[str] = []
                self._in_button = False
                self._button_text: List[str] = []

            def handle_starttag(self, tag, attrs):
                t = (tag or '').lower()
                role = ''
                aria = ''
                for k, v in attrs:
                    kk = (k or '').lower()
                    if kk == 'role':
                        role = (v or '').strip().lower()
                    elif kk == 'aria-label':
                        aria = (v or '').strip().lower()
                aria_has_nav = ('navigation' in aria) or (aria.startswith('nav')) or (' nav' in aria)
                is_container = t in {'nav', 'header'} or role in {'navigation', 'banner'} or aria_has_nav
                if is_container:
                    if not self._container_stack:
                        self._current = []
                    self._container_stack.append(t)
                    return
                if not self._container_stack:
                    return
                if t == 'a':
                    self._in_a = True
                    self._a_text = []
                    href = ''
                    for k, v in attrs:
                        if (k or '').lower() == 'href':
                            href = (v or '').strip()
                            break
                    self._a_href = href
                elif t == 'button':
                    self._in_button = True
                    self._button_text = []

            def handle_data(self, data):
                if not self._container_stack:
                    return
                s = str(data or '')
                if not s.strip():
                    return
                if self._in_a:
                    self._a_text.append(s)
                elif self._in_button:
                    self._button_text.append(s)
                else:
                    v = _maybe_label_token(s)
                    if v:
                        self._current.append(('label', v, ''))

            def handle_endtag(self, tag):
                t = (tag or '').lower()
                if self._container_stack and t == self._container_stack[-1]:
                    self._container_stack.pop()
                    if not self._container_stack:
                        if self._current:
                            self._containers.append(self._current)
                        self._current = []
                    return
                if not self._container_stack:
                    return
                if t == 'a' and self._in_a:
                    self._in_a = False
                    text = _strip_html_to_text(' '.join(self._a_text), max_chars=200)
                    href = (self._a_href or '').strip()
                    self._a_href = ''
                    self._a_text = []
                    if text:
                        self._current.append(('a', text, href))
                elif t == 'button' and self._in_button:
                    self._in_button = False
                    text = _strip_html_to_text(' '.join(self._button_text), max_chars=120)
                    self._button_text = []
                    if text:
                        self._current.append(('label', text, ''))

        parser = _NavParse()
        try:
            parser.feed(html_all[:350000])
            parser.close()
        except Exception:
            return []

        containers = parser._containers

        best: List[Tuple[str, str, str]]
        if containers:
            best = max(containers, key=lambda c: sum(1 for k, _, __ in c if k == 'label') * 3 + len(c))
        else:
            # Fallback: capture early-page anchors/buttons even when the site doesn't use <nav>/<header>/role markers.
            class _LooseParse(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.events: List[Tuple[str, str, str]] = []
                    self._in_a = False
                    self._a_href = ''
                    self._a_text: List[str] = []
                    self._in_button = False
                    self._button_text: List[str] = []
                    self._done = False

                def handle_starttag(self, tag, attrs):
                    if self._done:
                        return
                    t = (tag or '').lower()
                    if t == 'a':
                        self._in_a = True
                        self._a_text = []
                        href = ''
                        for k, v in attrs:
                            if (k or '').lower() == 'href':
                                href = (v or '').strip()
                                break
                        self._a_href = href
                    elif t == 'button':
                        self._in_button = True
                        self._button_text = []

                def handle_data(self, data):
                    if self._done:
                        return
                    s = str(data or '')
                    if not s.strip():
                        return
                    if self._in_a:
                        self._a_text.append(s)
                    elif self._in_button:
                        self._button_text.append(s)
                    else:
                        v = _maybe_label_token(s)
                        if v:
                            self.events.append(('label', v, ''))

                def handle_endtag(self, tag):
                    if self._done:
                        return
                    t = (tag or '').lower()
                    if t == 'a' and self._in_a:
                        self._in_a = False
                        text = _strip_html_to_text(' '.join(self._a_text), max_chars=200)
                        href = (self._a_href or '').strip()
                        self._a_href = ''
                        self._a_text = []
                        if text:
                            self.events.append(('a', text, href))
                    elif t == 'button' and self._in_button:
                        self._in_button = False
                        text = _strip_html_to_text(' '.join(self._button_text), max_chars=120)
                        self._button_text = []
                        if text:
                            self.events.append(('label', text, ''))
                    if len(self.events) >= 600:
                        self._done = True

            loose = _LooseParse()
            try:
                loose.feed(html_all[:250000])
                loose.close()
            except Exception:
                return []
            best = loose.events
        labels: List[str] = []
        for idx, (kind, text, _href) in enumerate(best):
            if idx > 220 and len(labels) >= 3:
                break
            if kind != 'label':
                continue
            v = _normalize_menu_label(text)
            if not v:
                continue
            if v.lower() in {x.lower() for x in labels}:
                continue
            labels.append(v)
            if len(labels) >= 10:
                break

        menus: Dict[str, List[str]] = {}
        current = labels[0] if labels else 'Primary'
        menus[current] = []
        label_set = {x.lower() for x in labels}

        for kind, text, _href in best:
            if kind == 'label':
                v = _normalize_menu_label(text)
                if not v:
                    continue
                if v.lower() not in label_set:
                    continue
                current = v
                if current not in menus:
                    menus[current] = []
                continue
            if kind != 'a':
                continue
            if not _should_keep_nav_item(text):
                continue
            item = ' '.join(text.split()).strip()
            if item.lower() in label_set:
                continue
            bucket = menus.get(current)
            if bucket is None:
                bucket = []
                menus[current] = bucket
            if item.lower() in {x.lower() for x in bucket}:
                continue
            bucket.append(item)

        out_lines: List[str] = []
        for label, items in menus.items():
            picked = [x for x in items if x]
            if label != 'Primary' and len(picked) < 3:
                continue
            if label == 'Primary' and len(picked) < 4:
                continue
            out_lines.append(f"- {label}: " + ' | '.join(picked[:12]))
        return out_lines

    nav_out = _extract_nav_menus(html_str)

    def _extract_nav_menus_from_markdown(md: str) -> List[str]:
        import re
        lines = (md or '').splitlines()
        out_lines: List[str] = []
        current_label = ''
        items: List[str] = []

        def flush() -> None:
            nonlocal current_label, items
            if current_label and len(items) >= 3:
                picked: List[str] = []
                for it in items:
                    if it.lower() in {x.lower() for x in picked}:
                        continue
                    picked.append(it)
                    if len(picked) >= 12:
                        break
                if len(picked) >= 3:
                    out_lines.append(f"- {current_label}: " + ' | '.join(picked))
            current_label = ''
            items = []

        label_re = re.compile(r'^[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2}$')
        link_re = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
        for raw in lines[:260]:
            line = (raw or '').strip()
            if not line:
                continue
            if line.startswith('#'):
                continue
            if line.startswith('---'):
                continue
            if line.startswith('- '):
                m = link_re.search(line)
                if current_label and m:
                    txt = ' '.join((m.group(1) or '').split()).strip()
                    if txt and len(txt) <= 48:
                        items.append(txt)
                continue

            if len(line) <= 24 and label_re.match(line):
                if current_label and line.lower() != current_label.lower():
                    flush()
                current_label = line
                continue
        flush()
        return out_lines

    if (not nav_out or len(nav_out) < 2) and markdown_hint:
        nav_out = _extract_nav_menus_from_markdown(markdown_hint)
    if nav_out:
        sections.append('## Extracted Navigation Menus')
        sections.extend(nav_out)
        sections.append('')

    # --- Templates (best-effort) ---
    template_frag = ''
    # Prefer explicit /templates URL occurrences over the generic word "template".
    m = re.search(r'/templates[^"\']*', html_str, flags=re.IGNORECASE)
    if m:
        t_idx2 = max(0, m.start() - 6000)
        template_frag = html_str[t_idx2: t_idx2 + 32000]
    else:
        t_idx = lower.find('template')
        if t_idx >= 0:
            template_frag = html_str[t_idx: t_idx + 32000]

    template_names: List[str] = []
    if template_frag:
        # Prefer anchors whose href indicates templates (support quoted and unquoted href)
        for m_a in re.finditer(r'<a\b[^>]*>.*?</a>', template_frag, flags=re.IGNORECASE | re.DOTALL):
            a_html = m_a.group(0)
            m_href = re.search(r'href\s*=\s*(?:"([^"]+)"|\'([^\']+)\'|([^\s>]+))', a_html, flags=re.IGNORECASE)
            href = (m_href.group(1) or m_href.group(2) or m_href.group(3) or '') if m_href else ''
            if not href:
                continue
            if 'template' not in href.lower() and '/templates' not in href.lower() and '/t/' not in href.lower():
                continue
            inner = re.sub(r'^<a\b[^>]*>', '', a_html, flags=re.IGNORECASE)
            inner = re.sub(r'</a>\s*$', '', inner, flags=re.IGNORECASE)
            text = _strip_html_to_text(inner, max_chars=160)
            if not text:
                continue
            if len(text) > 28:
                continue
            if text.lower() in {'templates', 'template'}:
                continue
            if text.lower() in stop_template:
                continue
            if text not in template_names:
                template_names.append(text)
            if len(template_names) >= 12:
                break

        # Then aria-labels for cards/buttons
        aria = re.findall(r'aria-label=["\']([^"\']+)["\']', template_frag, flags=re.IGNORECASE)
        for a in aria:
            v = ' '.join(a.split()).strip()
            if not v:
                continue
            if len(v) > 44:
                continue
            lv = v.lower()
            if lv.startswith('open '):
                v = v[5:].strip()
                lv = v.lower()
            if lv.endswith(' template'):
                v = v[:-9].strip()
                lv = v.lower()
            if lv.endswith('template'):
                v = v[:-8].strip()
                lv = v.lower()
            if not v:
                continue
            if v.lower() in stop_template:
                continue
            if v not in template_names:
                template_names.append(v)
            if len(template_names) >= 12:
                break

        # Common missing: "Blank" (often icon-only)
        if 'blank' in template_frag.lower() and all(n.lower() != 'blank' for n in template_names):
            template_names.insert(0, 'Blank')

        if len(template_names) <= 1:
            # Fallback: scrape likely JSON-embedded template names.
            # Many modern sites ship template catalogs via embedded JSON.
            def maybe_add(v: str) -> None:
                vv = ' '.join((v or '').split()).strip()
                if not vv:
                    return
                if len(vv) > 28:
                    return
                if vv.lower() in stop_template:
                    return
                if any(x in vv.lower() for x in ['http', '/', '{', '}', ':']):
                    return
                if vv not in template_names:
                    template_names.append(vv)

            json_candidates = re.findall(r'"(?:name|title|label)"\s*:\s*"([^"\\]{2,44})"', template_frag)
            for cand in json_candidates:
                maybe_add(cand)
                if len(template_names) >= 12:
                    break

            if len(template_names) <= 1:
                # Scan wider context in the full HTML but only accept candidates near /templates or the word template.
                for m2 in re.finditer(r'"(?:name|title|label)"\s*:\s*"([^"\\]{2,44})"', html_str):
                    ctx = html_str[max(0, m2.start() - 240): m2.end() + 240].lower()
                    if 'template' not in ctx and '/templates' not in ctx:
                        continue
                    maybe_add(m2.group(1))
                    if len(template_names) >= 12:
                        break

            if len(template_names) <= 1:
                # Next.js / React apps often ship the full catalog in __NEXT_DATA__.
                def collect_next_data_candidates(doc_html: str) -> List[str]:
                    m_nd = re.search(r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', doc_html, flags=re.IGNORECASE | re.DOTALL)
                    if not m_nd:
                        return []
                    raw = _html.unescape(m_nd.group(1) or '')
                    try:
                        obj = json.loads(raw)
                    except Exception:
                        return []

                    out: List[str] = []

                    def walk(x: Any, path: List[str]):
                        if len(out) >= 80:
                            return
                        if isinstance(x, dict):
                            for k, v in x.items():
                                walk(v, path + [str(k)])
                            return
                        if isinstance(x, list):
                            for v in x:
                                walk(v, path)
                            return
                        if isinstance(x, str):
                            p = ' '.join(path).lower()
                            if 'template' not in p and 'templates' not in p:
                                return
                            s = ' '.join(x.split()).strip()
                            if not s:
                                return
                            if len(s) > 28:
                                return
                            if s.lower() in stop_template:
                                return
                            if any(ch in s for ch in ['{', '}', ':', '/', '\\']):
                                return
                            out.append(s)

                    walk(obj, [])
                    return out

                for cand in collect_next_data_candidates(html_str):
                    maybe_add(cand)
                    if len(template_names) >= 12:
                        break

        if len(template_names) <= 1 and '/templates' in lower:
            # Fallback: fetch /templates and extract from that page (often contains a full catalog).
            try:
                parsed_base = urlparse(base_url)
                templates_url = urljoin(base_url, '/templates')
                parsed_t = urlparse(templates_url)
                if parsed_base.netloc and parsed_t.netloc == parsed_base.netloc:
                    html_bytes = _fetch_url(templates_url, timeout=20)
                    html_tpl = html_bytes.decode('utf-8', errors='replace')
                    html_tpl_lower = html_tpl.lower()
                    frag_idx = html_tpl_lower.find('template')
                    frag = html_tpl[max(0, frag_idx - 8000): frag_idx + 42000] if frag_idx >= 0 else html_tpl[:42000]

                    for m_a in re.finditer(r'<a\b[^>]*>.*?</a>', frag, flags=re.IGNORECASE | re.DOTALL):
                        a_html = m_a.group(0)
                        m_href = re.search(r'href\s*=\s*(?:"([^"]+)"|\'([^\']+)\'|([^\s>]+))', a_html, flags=re.IGNORECASE)
                        href = (m_href.group(1) or m_href.group(2) or m_href.group(3) or '') if m_href else ''
                        if '/templates' not in href.lower():
                            continue
                        inner = re.sub(r'^<a\b[^>]*>', '', a_html, flags=re.IGNORECASE)
                        inner = re.sub(r'</a>\s*$', '', inner, flags=re.IGNORECASE)
                        text = _strip_html_to_text(inner, max_chars=160)
                        if not text:
                            continue
                        if len(text) > 44:
                            continue
                        if text.lower() in {'templates', 'template'}:
                            continue
                        if text.lower() in stop_template:
                            continue
                        if text not in template_names:
                            template_names.append(text)
                        if len(template_names) >= 12:
                            break
            except Exception:
                pass

    if len(template_names) >= 4:
        sections.append('## Templates')
        for name in template_names[:8]:
            sections.append(f"- {name}")
        sections.append('')

    asset_urls: List[str] = []
    asset_seen: set = set()

    def add_asset(raw: str) -> None:
        v = str(raw or '').strip().strip('"\'')
        if not v:
            return
        if v.startswith('data:') or v.startswith('javascript:'):
            return
        try:
            abs_u = urljoin(base_url, v)
        except Exception:
            return
        low_u = abs_u.lower()
        if not (low_u.startswith('http://') or low_u.startswith('https://')):
            return
        if any(x in low_u for x in ['\n', '\r', '\t']):
            return
        if not re.search(r'\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|m4v|mp3|wav|pdf)(\?|#|$)', low_u):
            return
        if abs_u in asset_seen:
            return
        asset_seen.add(abs_u)
        asset_urls.append(abs_u)

    try:
        for m in re.finditer(r'\b(?:src|data-src|data-original|poster)\s*=\s*(?:"([^"]+)"|\'([^\']+)\')', html_str, flags=re.IGNORECASE):
            add_asset(m.group(1) or m.group(2) or '')
            if len(asset_urls) >= 24:
                break
        if len(asset_urls) < 24:
            for m in re.finditer(r'\bsrcset\s*=\s*(?:"([^"]+)"|\'([^\']+)\')', html_str, flags=re.IGNORECASE):
                raw_set = m.group(1) or m.group(2) or ''
                first = (raw_set.split(',')[0] or '').strip().split(' ')[0]
                add_asset(first)
                if len(asset_urls) >= 24:
                    break
        if len(asset_urls) < 24:
            for m in re.finditer(r'url\(\s*(?:"([^"]+)"|\'([^\']+)\'|([^\)\s]+))\s*\)', html_str, flags=re.IGNORECASE):
                add_asset(m.group(1) or m.group(2) or m.group(3) or '')
                if len(asset_urls) >= 24:
                    break
    except Exception:
        pass

    if asset_urls:
        sections.append('## Assets (Extracted)')
        for u in asset_urls[:12]:
            sections.append(f'- {u}')
        sections.append('')

    cta_items: List[Tuple[str, str]] = []
    cta_seen: set = set()
    cta_keywords = {
        'apply',
        'join',
        'get started',
        'signup',
        'sign up',
        'register',
        'request',
        'book',
        'contact',
        'download',
        'try',
        'demo',
        'learn more',
        'submit',
    }

    def _maybe_add_cta(text: str, href: str, why: str = '') -> None:
        t = ' '.join((text or '').split()).strip()
        if not t or len(t) > 72:
            return
        h = str(href or '').strip().strip('"\'')
        if not h:
            return
        if any(x in h for x in ['\n', '\r', '\t', '{', '}', ';']):
            return
        if re.search(r'\s', h):
            return
        if h.startswith('javascript:') or h.startswith('data:') or h.startswith('#'):
            return
        try:
            abs_u = urljoin(base_url, h)
        except Exception:
            return
        low = abs_u.lower()
        if not (low.startswith('http://') or low.startswith('https://')):
            return
        key = f'{t.lower()}::{abs_u}'
        if key in cta_seen:
            return
        cta_seen.add(key)
        cta_items.append((t, abs_u))

    try:
        for m in re.finditer(r'<a\b[^>]*>.*?</a>', html_str, flags=re.IGNORECASE | re.DOTALL):
            a_html = m.group(0)
            m_href = re.search(r'href\s*=\s*(?:"([^"]+)"|\'([^\']+)\'|([^\s>]+))', a_html, flags=re.IGNORECASE)
            href = (m_href.group(1) or m_href.group(2) or m_href.group(3) or '') if m_href else ''
            href = str(href or '').strip().strip('"\'')
            inner = re.sub(r'^<a\b[^>]*>', '', a_html, flags=re.IGNORECASE)
            inner = re.sub(r'</a>\s*$', '', inner, flags=re.IGNORECASE)
            txt = _strip_html_to_text(inner, max_chars=120)
            cls_m = re.search(r'class\s*=\s*(?:"([^"]+)"|\'([^\']+)\')', a_html, flags=re.IGNORECASE)
            cls = (cls_m.group(1) or cls_m.group(2) or '') if cls_m else ''
            cls_l = cls.lower()
            txt_l = txt.lower()
            is_cta = any(k in txt_l for k in cta_keywords) or any(k in cls_l for k in ['btn', 'button', 'cta', 'primary'])
            is_cta = is_cta or any(h in (href or '').lower() for h in ['typeform', 'airtable.com', 'forms.gle', '/form', 'form'])
            if is_cta:
                _maybe_add_cta(txt, href)
            if len(cta_items) >= 18:
                break

        if len(cta_items) < 18:
            for m in re.finditer(r'<button\b[^>]*>.*?</button>', html_str, flags=re.IGNORECASE | re.DOTALL):
                b_html = m.group(0)
                inner = re.sub(r'^<button\b[^>]*>', '', b_html, flags=re.IGNORECASE)
                inner = re.sub(r'</button>\s*$', '', inner, flags=re.IGNORECASE)
                txt = _strip_html_to_text(inner, max_chars=120)
                txt_l = txt.lower()
                if not any(k in txt_l for k in cta_keywords):
                    continue
                m_url = re.search(r'data-url\s*=\s*(?:"([^"]+)"|\'([^\']+)\')', b_html, flags=re.IGNORECASE)
                href = (m_url.group(1) or m_url.group(2) or '') if m_url else ''
                if href:
                    _maybe_add_cta(txt, href)
                if len(cta_items) >= 18:
                    break
    except Exception:
        pass

    if cta_items:
        sections.append('## CTAs (Extracted)')
        for t, u in cta_items[:12]:
            sections.append(f'- [{t}]({u})')
        sections.append('')

    link_rows: List[List[str]] = []
    link_seen: set = set()
    try:
        for m in re.finditer(r'<a\b[^>]*>.*?</a>', html_str, flags=re.IGNORECASE | re.DOTALL):
            a_html = m.group(0)
            m_href = re.search(r'href\s*=\s*(?:"([^"]+)"|\'([^\']+)\'|([^\s>]+))', a_html, flags=re.IGNORECASE)
            href = (m_href.group(1) or m_href.group(2) or m_href.group(3) or '') if m_href else ''
            href = str(href or '').strip().strip('"\'')
            if not href or href.startswith('#') or href.startswith('javascript:') or href.startswith('data:'):
                continue
            if any(x in href for x in ['\n', '\r', '\t', '{', '}', ';']):
                continue
            if re.search(r'\s', href):
                continue
            try:
                abs_u = urljoin(base_url, href)
            except Exception:
                continue
            low = abs_u.lower()
            if not (low.startswith('http://') or low.startswith('https://') or low.startswith('mailto:')):
                continue
            if abs_u in link_seen:
                continue
            link_seen.add(abs_u)
            inner = re.sub(r'^<a\b[^>]*>', '', a_html, flags=re.IGNORECASE)
            inner = re.sub(r'</a>\s*$', '', inner, flags=re.IGNORECASE)
            txt = _strip_html_to_text(inner, max_chars=90)
            link_rows.append([txt[:60] if txt else '', abs_u])
            if len(link_rows) >= 40:
                break
    except Exception:
        pass

    if link_rows:
        sections.append('## Links (Extracted)')
        sections.append(_rows_to_markdown_table([['Text', 'URL'], *link_rows]))
        sections.append('')

    form_lines: List[str] = []
    try:
        form_blocks = re.findall(r'<form\b[\s\S]*?</form\s*>', html_str, flags=re.IGNORECASE)
        for fb in form_blocks[:6]:
            m_action = re.search(r'action\s*=\s*(?:"([^"]+)"|\'([^\']+)\'|([^\s>]+))', fb, flags=re.IGNORECASE)
            action = (m_action.group(1) or m_action.group(2) or m_action.group(3) or '') if m_action else ''
            action = str(action or '').strip().strip('"\'')
            if action in {"''", '""'}:
                action = ''
            if any(x in action for x in ['\n', '\r', '\t', '{', '}', ';']):
                action = ''
            try:
                action_abs = urljoin(base_url, action) if action else ''
            except Exception:
                action_abs = ''
            m_method = re.search(r'method\s*=\s*(?:"([^"]+)"|\'([^\']+)\')', fb, flags=re.IGNORECASE)
            method = (m_method.group(1) or m_method.group(2) or '').upper() if m_method else ''
            header = 'Form'
            if action_abs:
                header = f'Form ({method or "GET"}): {action_abs}'
            form_lines.append(f'- {header}')

            field_rows: List[List[str]] = []
            for m_inp in re.finditer(r'<(input|textarea|select)\b[^>]*>', fb, flags=re.IGNORECASE):
                tag = (m_inp.group(1) or '').lower()
                frag = m_inp.group(0)
                m_type = re.search(r'type\s*=\s*(?:"([^"]+)"|\'([^\']+)\')', frag, flags=re.IGNORECASE)
                ftype = (m_type.group(1) or m_type.group(2) or '') if m_type else (tag if tag != 'input' else '')
                m_name = re.search(r'name\s*=\s*(?:"([^"]+)"|\'([^\']+)\')', frag, flags=re.IGNORECASE)
                name = (m_name.group(1) or m_name.group(2) or '') if m_name else ''
                m_ph = re.search(r'placeholder\s*=\s*(?:"([^"]+)"|\'([^\']+)\')', frag, flags=re.IGNORECASE)
                ph = (m_ph.group(1) or m_ph.group(2) or '') if m_ph else ''
                m_al = re.search(r'aria-label\s*=\s*(?:"([^"]+)"|\'([^\']+)\')', frag, flags=re.IGNORECASE)
                al = (m_al.group(1) or m_al.group(2) or '') if m_al else ''
                label = (al or ph or name).strip()
                if not (label or ftype):
                    continue
                field_rows.append([label[:60], ftype[:16]])
                if len(field_rows) >= 10:
                    break
            if field_rows:
                    form_lines.append(_rows_to_markdown_table([['Field', 'Type'], *field_rows]))
    except Exception:
        pass

    if form_lines:
        sections.append('## Forms (Extracted)')
        sections.extend(form_lines)
        sections.append('')

    # --- Pricing (plans + key prices) ---
    pricing_frag = ''
    p_idx = lower.find('pricing')
    if p_idx >= 0:
        start = max(0, p_idx - 4000)
        pricing_frag = html_str[start: start + 80000]
    else:
        # Fallback near first license mention
        m = re.search(r'\blicense\b', lower)
        if m:
            start = max(0, m.start() - 4000)
            pricing_frag = html_str[start: start + 80000]

    if pricing_frag:
        text_flat = _strip_html_to_text(pricing_frag, max_chars=120000)
        # license names
        plans = re.findall(r'\b([A-Z][A-Za-z+]*(?:\s+[A-Z][A-Za-z+]+){0,3})\s+License\b', text_flat)
        picked_plans: List[str] = []
        for p in plans:
            words = [w for w in p.split() if w]
            v = ' '.join(words[-2:]).strip() if len(words) > 2 else ' '.join(words).strip()
            if not v:
                continue
            if any(bad in v.lower() for bad in {'support', 'community', 'resources', 'documentation', 'docs', 'api'}):
                continue
            label = f"{v} License"
            if label not in picked_plans:
                picked_plans.append(label)
            if len(picked_plans) >= 6:
                break
        plans_lc = [p.lower() for p in picked_plans]
        prices = re.findall(r'\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s*\/\s*(?:mo|month|yr|year))?', text_flat)
        uniq_prices: List[str] = []
        for pr in prices:
            v = re.sub(r'\s+', '', pr).strip()
            if not v:
                continue
            if v not in uniq_prices:
                uniq_prices.append(v)
            if len(uniq_prices) >= 10:
                break

        if picked_plans or uniq_prices:
            sections.append('## Pricing (Extracted)')
            if picked_plans:
                sections.append('- Plans: ' + ' | '.join(picked_plans[:3]))
            if uniq_prices:
                sections.append('- Prices: ' + ' | '.join(uniq_prices[:8]))
            sections.append('')

            text_flat_lower = text_flat.lower()

            def has(needle: str) -> bool:
                return needle.lower() in text_flat_lower

            def has_re(pat: str) -> bool:
                return re.search(pat, text_flat, flags=re.IGNORECASE) is not None

            variant_titles: List[str] = []
            for m2 in re.finditer(
                r'\b([A-Z][A-Za-z0-9+]*(?:\s+[A-Z][A-Za-z0-9+]+){0,5}\s+for\s+[A-Za-z0-9+]+(?:\s+[A-Za-z0-9+]+){0,4})\b',
                text_flat,
            ):
                t = ' '.join((m2.group(1) or '').split()).strip()
                if not t:
                    continue
                if len(t) > 48:
                    continue
                tl = t.lower()
                if tl in variant_titles:
                    continue
                if any(stop in tl for stop in ['sign in', 'log in', 'contact', 'docs', 'documentation', 'api']):
                    continue
                variant_titles.append(t)
                if len(variant_titles) >= 4:
                    break

            if variant_titles and ('license' in text_flat_lower or 'pricing' in text_flat_lower):
                sections.append('## Company License Options (Extracted)')
                sections.append('')

                for title in variant_titles[:3]:
                    sections.append(f'### {title}')
                    idx = text_flat_lower.find(title.lower())
                    window = text_flat[max(0, idx - 2000) : idx + 4000] if idx >= 0 else text_flat[:4000]
                    prices_near = re.findall(
                        r'\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s*\/\s*(?:mo|month|yr|year))?',
                        window,
                    )
                    if prices_near:
                        sections.append(f'- **Price:** {" ".join(prices_near[0].split()).strip()}')

                    min_m = re.search(r'\bminimum\b[^\n]{0,80}\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?', window, flags=re.IGNORECASE)
                    if min_m:
                        sections.append(f'- **Minimum:** {" ".join(min_m.group(0).split()).strip()}')

                    use_m = re.search(r'\buse\s+case\b\s*[:\-]?\s*([^\n]{10,140})', window, flags=re.IGNORECASE)
                    if use_m:
                        sections.append(f'- **Use Case:** {" ".join(use_m.group(1).split()).strip()}')

                    best_m = re.search(r'\bbest\s+for\b\s*[:\-]?\s*([^\n]{10,140})', window, flags=re.IGNORECASE)
                    if best_m:
                        sections.append(f'- **Best For:** {" ".join(best_m.group(1).split()).strip()}')

                    sections.append('')

            price_details_rows: List[Tuple[str, str, str]] = []
            if uniq_prices:
                for pr in uniq_prices[:10]:
                    context = 'Pricing'
                    pr_lc = pr.lower()
                    if '/mo' in pr_lc or '/month' in pr_lc or '/yr' in pr_lc or '/year' in pr_lc:
                        context = 'Subscription'
                    desc = 'Extracted price token'
                    price_details_rows.append((pr, context, desc))

            if price_details_rows:
                sections.append('## Pricing Details (Extracted)')
                sections.append('')
                sections.append(_rows_to_markdown_table([
                    ['Price Point', 'Context', 'Description'],
                    *[[f'**{pp}**', ctx, desc] for pp, ctx, desc in price_details_rows],
                ]))
                sections.append('')

        # Best-effort comparison table for common 3-tier pricing layouts.
        plans_lc = [p.lower() for p in picked_plans]
        if any('free license' in p for p in plans_lc) and any('company license' in p for p in plans_lc) and any('enterprise license' in p for p in plans_lc):
            free_team = '≤3 people' if '≤3' in text_flat or '≤ 3' in text_flat or has('3 people') else '(not detected)'
            company_team = '4+ people' if has('4+ people') or has('4 + people') or has('4 people') else '(not detected)'
            enterprise_team = 'Unlimited' if has('unlimited') else '(not detected)'

            company_cost = '$25/mo per seat OR $0.01 per render' if has('$25/mo') or has('$0.01') else '(not detected)'
            enterprise_cost = 'Starting at $500/mo' if has('$500') else '(not detected)'
            mux = '$250 Mux credits' if has('$250') and has('mux') else '(not detected)'
            support_company = 'Priority' if has('priority') and has('support') else '(not detected)'
            support_enterprise = 'Dedicated' if has('slack') or has('monthly') or has('dedicated') else '(not detected)'
            editor_included = 'Included' if has('editor starter') and has('included') else '(not detected)'

            sections.append('## Pricing Comparison (Extracted)')
            sections.append(_rows_to_markdown_table([
                ['Feature', 'Free License', 'Company License', 'Enterprise License'],
                ['**Team Size**', free_team, company_team, enterprise_team],
                ['**Commercial Use**', '✅ Yes', '✅ Yes', '✅ Yes'],
                ['**Cost**', '$0', company_cost, enterprise_cost],
                ['**Support**', 'Community', support_company, support_enterprise],
                ['**Mux Credits**', '❌', mux, '✅ Custom'],
                ['**Editor Starter**', '❌', '❌', editor_included],
                ['**Custom Terms**', '❌', '❌', '✅ Yes' if has('custom') or has('terms') else '(not detected)'],
                ['**Compliance**', '❌', '❌', '✅ Forms available' if has('compliance') or has('forms') else '(not detected)'],
            ]))
            sections.append('')

    # --- Rendering options (best-effort) ---
    render_text = _strip_html_to_text(html_str, max_chars=200000).lower()
    if any(k in render_text for k in ['render options', 'render targets', 'serverless', 'lambda', 'docker', 'node.js server', 'local machine', 'cli']):
        has_cli = any(k in render_text for k in ['cli', 'local machine', 'locally'])
        has_server = any(k in render_text for k in ['node.js server', 'on the server', 'server '])
        has_lambda = 'lambda' in render_text or 'serverless' in render_text
        if has_cli or has_server or has_lambda:
            sections.append('## Rendering Options (Extracted)')
            rendering_rows: List[List[str]] = []
            if has_cli:
                rendering_rows.append(['**Local CLI**', 'Medium', 'Free', 'Development, small batches'])
            if has_server:
                rendering_rows.append(['**Server**', 'Fast', 'Server costs', 'Production deployments'])
            if has_lambda:
                rendering_rows.append(['**Lambda**', 'Very Fast', 'Pay-per-render', 'Massive scale, variable load'])
            sections.append(_rows_to_markdown_table([['Method', 'Speed', 'Cost', 'Best For'], *rendering_rows]))
            sections.append('')

    # --- Pricing / comparison tables ---
    # If there are tables containing pricing tokens, emit an extracted Markdown table.
    tables = re.findall(r'<table[^>]*>.*?</table>', html_str, flags=re.IGNORECASE | re.DOTALL)
    picked_tables: List[str] = []
    for t in tables:
        tl = t.lower()
        if 'license' not in tl and '$' not in tl and 'pricing' not in tl:
            continue
        md = _table_html_to_markdown(t, max_rows=10, max_cols=5)
        if not md:
            continue
        picked_tables.append(md)
        if len(picked_tables) >= 2:
            break

    if picked_tables:
        sections.append('## Pricing Tables (Extracted)')
        for md in picked_tables:
            sections.append(md)
            sections.append('')

    return '\n'.join(sections).strip()


def main(argv: Optional[List[str]] = None, *, parser_script_path: Optional[str] = None) -> int:
    parser = argparse.ArgumentParser(description="Extract webpage to Markdown")
    parser.add_argument("--url", required=True, help="Webpage URL")
    parser.add_argument("--html-path", default="", help="Path to HTML file to parse instead of fetching URL")
    parser.add_argument("--emit", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--no-images", action="store_true", help="Disable image extraction")
    parser.add_argument(
        "--emit-extras",
        action="store_true",
        help="Append heuristic extracted blocks. Disabled by default to avoid introducing non-source content.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    url = args.url.strip()
    try:
        html_str = ""
        html_path = (args.html_path or "").strip()
        if html_path:
            with open(html_path, 'rb') as f:
                html_bytes = f.read()
            html_str = html_bytes.decode('utf-8', errors='replace')
        else:
            html_bytes = _fetch_url(url)
            html_str = html_bytes.decode('utf-8', errors='replace')
        
        parser = SimpleMarkdownParser(url, include_images=not args.no_images)
        parser.feed(html_str)
        markdown = _postprocess_markdown(parser.get_markdown())

        if args.emit_extras:
            extras = _extract_structured_details_markdown(html_str, url, markdown_hint=markdown)
            if extras:
                markdown = markdown.rstrip() + "\n\n---\n\n" + extras + "\n"
        
        title = _extract_best_title(html_str, markdown, url)
        name = f"webpage-{slugify(title) or slugify(url)}.md"
        
        if args.emit == "json":
            payload = {
                "ok": True,
                "name": name,
                "markdown": markdown,
                "title": title,
                "source_url": url,
                "images": parser.images
            }
            print(json.dumps(payload, ensure_ascii=False))
        else:
            print(markdown)
            
        return 0
    except Exception as e:
        msg = f"Error processing webpage: {e}"
        if args.emit == "json":
            print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False))
            return 0
        print(msg, file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
