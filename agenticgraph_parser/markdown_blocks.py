import re
from dataclasses import dataclass
from typing import Any, Dict, List, Sequence, Tuple, Optional


@dataclass(frozen=True)
class Block:
    kind: str
    start_line: int
    end_line: int
    level: Optional[int] = None
    text: str = ""
    extra: Optional[Dict[str, Any]] = None


HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
LIST_RE = re.compile(r"^(\s*)([-*+]|(\d+)\.)\s+(.*)$")
FENCE_RE = re.compile(r"^```(\s*\w+)?\s*$")
LINK_RE = re.compile(r"(?<!!)\[([^\]]+)\]\(([^)]+)\)")
IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")


def split_lines(text: str) -> List[str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return lines


def parse_frontmatter(lines: List[str]) -> Tuple[Dict[str, Any], int]:
    if not lines or lines[0].strip() != "---":
        return {}, 0
    meta: Dict[str, Any] = {}
    current_list_key: Optional[str] = None
    current_item: Optional[Dict[str, Any]] = None
    items: List[Any] = []
    end_index = 0
    i = 1
    while i < len(lines):
        raw = (lines[i] or "").strip()
        if raw == "---":
            end_index = i + 1
            break
        if current_list_key == "ontologies":
            if not raw:
                i += 1
                continue
            if raw.startswith("- "):
                if current_item:
                    items.append(current_item)
                payload = raw[2:].strip()
                if payload and ":" in payload:
                    k, v = payload.split(":", 1)
                    current_item = {k.strip(): v.strip()}
                elif payload:
                    current_item = {"value": payload}
                else:
                    current_item = {}
                i += 1
                continue
            if raw.startswith("prefix:") or raw.startswith("iri:"):
                if current_item is None:
                    current_item = {}
                k, v = raw.split(":", 1)
                current_item[k.strip()] = v.strip()
                i += 1
                continue
            if current_item:
                items.append(current_item)
            meta["ontologies"] = items
            current_list_key = None
            current_item = None
            items = []
            continue
        if current_list_key == "graphLayers":
            if raw.startswith("- "):
                payload = raw[2:].strip()
                if payload:
                    items.append(payload)
                i += 1
                continue
            meta["graphLayers"] = items
            current_list_key = None
            items = []
            continue
        if not raw or raw.startswith("#"):
            i += 1
            continue
        if raw == "ontologies:":
            current_list_key = "ontologies"
            current_item = None
            items = []
            i += 1
            continue
        if raw == "graphLayers:":
            current_list_key = "graphLayers"
            current_item = None
            items = []
            i += 1
            continue
        if ":" not in raw:
            i += 1
            continue
        k, v = raw.split(":", 1)
        key = k.strip()
        val = v.strip()
        if key:
            meta[key] = val
        i += 1
    if current_list_key == "ontologies":
        if current_item:
            items.append(current_item)
        if "ontologies" not in meta:
            meta["ontologies"] = items
    elif current_list_key == "graphLayers":
        if "graphLayers" not in meta:
            meta["graphLayers"] = items
    return meta, end_index


def is_table_sep(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if "|" not in s:
        return False
    parts = [p.strip() for p in s.strip("|").split("|")]
    if len(parts) < 2:
        return False
    return all(re.fullmatch(r":?-{3,}:?", p) is not None for p in parts)


def parse_blocks(lines: Sequence[str]) -> List[Block]:
    blocks: List[Block] = []
    i = 0

    def flush_paragraph(buf: List[str], start: int, end: int) -> None:
        if not buf:
            return
        joined = "\n".join(buf).strip()
        if not joined:
            return
        blocks.append(Block(kind="paragraph", start_line=start, end_line=end, text=joined))

    paragraph_buf: List[str] = []
    paragraph_start = 1

    while i < len(lines):
        line = lines[i]
        line_no = i + 1

        fence_match = FENCE_RE.match(line)
        if fence_match:
            flush_paragraph(paragraph_buf, paragraph_start, line_no - 1)
            paragraph_buf = []
            lang = (fence_match.group(1) or "").strip() or None
            start = line_no
            code_lines: List[str] = []
            i += 1
            while i < len(lines):
                inner = lines[i]
                if inner.strip().startswith("```"):
                    end = i + 1
                    blocks.append(
                        Block(
                            kind="code",
                            start_line=start,
                            end_line=end,
                            text="\n".join(code_lines),
                            extra={"language": lang},
                        )
                    )
                    break
                code_lines.append(inner)
                i += 1
            else:
                end = len(lines)
                blocks.append(
                    Block(
                        kind="code",
                        start_line=start,
                        end_line=end,
                        text="\n".join(code_lines),
                        extra={"language": lang},
                    )
                )
                break
            i += 1
            paragraph_start = i + 1
            continue

        heading_match = HEADING_RE.match(line)
        if heading_match:
            flush_paragraph(paragraph_buf, paragraph_start, line_no - 1)
            paragraph_buf = []
            level = len(heading_match.group(1))
            title = heading_match.group(2).strip()
            blocks.append(Block(kind="heading", start_line=line_no, end_line=line_no, level=level, text=title))
            i += 1
            paragraph_start = i + 1
            continue

        if i + 1 < len(lines) and "|" in line and is_table_sep(lines[i + 1]):
            flush_paragraph(paragraph_buf, paragraph_start, line_no - 1)
            paragraph_buf = []
            start = line_no
            table_lines = [line, lines[i + 1]]
            i += 2
            while i < len(lines):
                ln = lines[i]
                if not ln.strip() or "|" not in ln:
                    break
                table_lines.append(ln)
                i += 1
            end = start + len(table_lines) - 1
            blocks.append(Block(kind="table", start_line=start, end_line=end, text="\n".join(table_lines)))
            paragraph_start = i + 1
            continue

        list_match = LIST_RE.match(line)
        if list_match:
            flush_paragraph(paragraph_buf, paragraph_start, line_no - 1)
            paragraph_buf = []
            start = line_no
            indent = len(list_match.group(1) or "")
            items: List[Dict[str, Any]] = []
            while i < len(lines):
                m = LIST_RE.match(lines[i])
                if not m:
                    break
                cur_indent = len(m.group(1) or "")
                if cur_indent != indent:
                    break
                marker = m.group(2)
                ordered = marker.endswith(".")
                index = int(m.group(3)) if ordered and m.group(3) else None
                items.append({"text": m.group(4).rstrip(), "ordered": ordered, "index": index, "indent": indent})
                i += 1
            end = i
            blocks.append(Block(kind="list", start_line=start, end_line=end, text="", extra={"items": items}))
            paragraph_start = i + 1
            continue

        if not line.strip():
            flush_paragraph(paragraph_buf, paragraph_start, line_no - 1)
            paragraph_buf = []
            i += 1
            paragraph_start = i + 1
            continue

        if not paragraph_buf:
            paragraph_start = line_no
        paragraph_buf.append(line.rstrip())
        i += 1

    flush_paragraph(paragraph_buf, paragraph_start, len(lines))
    return blocks


def extract_links(text: str) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for m in LINK_RE.finditer(text):
        label = (m.group(1) or "").strip()
        url = (m.group(2) or "").strip()
        if label and url:
            out.append((label, url))
    return out


def extract_images(text: str) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for m in IMAGE_RE.finditer(text):
        alt = (m.group(1) or "").strip()
        url = (m.group(2) or "").strip()
        if url:
            out.append((alt, url))
    return out
