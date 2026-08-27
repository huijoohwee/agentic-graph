import argparse
import json
import sys
from dataclasses import dataclass
from typing import Any, Iterable, List, Mapping, MutableMapping, Optional, Sequence

from .markdown_tables import serialize_markdown_pipe_table


JsonLike = Any


@dataclass
class JsonToMarkdownConfig:
    default_mode: str = "auto"
    table_max_rows: int = 200
    table_max_columns: int = 40
    indent: str = "  "
    bullet: str = "-"
    sort_keys: bool = True


def _is_scalar(value: Any) -> bool:
    return isinstance(value, (str, int, float, bool)) or value is None


def _flatten_iterable(value: Iterable[Any]) -> Iterable[Any]:
    for item in value:
        yield item


def _looks_like_uniform_object_array(items: Sequence[Any]) -> bool:
    if not items:
        return False
    first = items[0]
    if not isinstance(first, Mapping):
        return False
    base_keys = list(first.keys())
    if not base_keys:
        return False
    base_key_set = set(base_keys)
    for item in items[1:]:
        if not isinstance(item, Mapping):
            return False
        keys = set(item.keys())
        if keys != base_key_set:
            return False
    return True


def _row_has_nested_values(row: Mapping[str, Any]) -> bool:
    for value in row.values():
        if isinstance(value, Mapping):
            return True
        if isinstance(value, (list, tuple)):
            return True
    return False


def _has_nested_structures(value: Any) -> bool:
    if isinstance(value, Mapping):
        for v in value.values():
            if isinstance(v, Mapping):
                return True
            if isinstance(v, (list, tuple)):
                return True
        return False
    if isinstance(value, (list, tuple)):
        for v in value:
            if isinstance(v, Mapping):
                return True
            if isinstance(v, (list, tuple)):
                return True
        return False
    return False


def _format_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return str(value)


def _detect_mode(value: JsonLike, config: JsonToMarkdownConfig) -> str:
    if config.default_mode in ("table", "key-value", "hierarchical"):
        return config.default_mode
    if isinstance(value, list):
        if not value:
            return "hierarchical"
        if _looks_like_uniform_object_array(value):
            if not _row_has_nested_values(value[0]):  # type: ignore[arg-type]
                return "table"
        return "hierarchical"
    if isinstance(value, Mapping):
        if _has_nested_structures(value):
            return "hierarchical"
        return "key-value"
    return "key-value"


def _render_table(rows: Sequence[Mapping[str, Any]], config: JsonToMarkdownConfig) -> List[str]:
    if not rows:
        return ["(empty array)"]
    header_keys = list(rows[0].keys())
    if config.table_max_columns > 0 and len(header_keys) > config.table_max_columns:
        header_keys = header_keys[: config.table_max_columns]
    max_rows = config.table_max_rows if config.table_max_rows > 0 else len(rows)
    visible_rows = rows[:max_rows]
    body_rows: List[List[str]] = []
    for row in visible_rows:
        cells: List[str] = []
        for key in header_keys:
            value = row.get(key)
            if _is_scalar(value):
                cell = _format_scalar(value)
            else:
                cell = json.dumps(value, ensure_ascii=False)
            cells.append(cell)
        body_rows.append(cells)
    lines = serialize_markdown_pipe_table([str(key) or "key" for key in header_keys], body_rows)
    if len(rows) > max_rows:
        remaining = len(rows) - max_rows
        lines.append("")
        lines.append(f"... {remaining} more rows")
    return lines


def _render_key_value(obj: Mapping[str, Any], config: JsonToMarkdownConfig, level: int = 0) -> List[str]:
    keys = list(obj.keys())
    if config.sort_keys:
        try:
            keys = sorted(keys)
        except TypeError:
            pass
    lines: List[str] = []
    indent = config.indent * level
    for key in keys:
        value = obj.get(key)
        label = f"**{key}**"
        prefix = f"{indent}{config.bullet} "
        if _is_scalar(value) or not _has_nested_structures(value):
            rendered = _format_scalar(value)
            lines.append(f"{prefix}{label}: {rendered}")
        else:
            lines.append(f"{prefix}{label}:")
            lines.extend(_render_hierarchical(value, config, level + 1))
    return lines


def _render_hierarchical(value: JsonLike, config: JsonToMarkdownConfig, level: int = 0) -> List[str]:
    lines: List[str] = []
    indent = config.indent * level
    if isinstance(value, Mapping):
        keys = list(value.keys())
        if config.sort_keys:
            try:
                keys = sorted(keys)
            except TypeError:
                pass
        for key in keys:
            v = value.get(key)
            label = f"**{key}**"
            prefix = f"{indent}{config.bullet} "
            if _is_scalar(v):
                rendered = _format_scalar(v)
                lines.append(f"{prefix}{label}: {rendered}")
            elif isinstance(v, Mapping) or isinstance(v, (list, tuple)):
                lines.append(f"{prefix}{label}:")
                lines.extend(_render_hierarchical(v, config, level + 1))
            else:
                rendered = _format_scalar(v)
                lines.append(f"{prefix}{label}: {rendered}")
        return lines
    if isinstance(value, (list, tuple)):
        if not value:
            lines.append(f"{indent}{config.bullet} (empty list)")
            return lines
        for index, item in enumerate(_flatten_iterable(value)):
            prefix = f"{indent}{config.bullet} "
            if _is_scalar(item):
                rendered = _format_scalar(item)
                lines.append(f"{prefix}{rendered}")
            elif isinstance(item, Mapping) or isinstance(item, (list, tuple)):
                label = f"item {index + 1}"
                lines.append(f"{prefix}{label}:")
                lines.extend(_render_hierarchical(item, config, level + 1))
            else:
                rendered = _format_scalar(item)
                lines.append(f"{prefix}{rendered}")
        return lines
    rendered = _format_scalar(value)
    lines.append(f"{indent}{rendered}")
    return lines


def json_to_markdown(value: JsonLike, config: Optional[JsonToMarkdownConfig] = None, mode: Optional[str] = None) -> str:
    cfg = config or JsonToMarkdownConfig()
    effective_mode = mode or cfg.default_mode
    if effective_mode not in ("table", "key-value", "hierarchical"):
        effective_mode = _detect_mode(value, cfg)
    if effective_mode == "table":
        if isinstance(value, list) and value and _looks_like_uniform_object_array(value) and not _row_has_nested_values(value[0]):  # type: ignore[arg-type]
            lines = _render_table(value, cfg)  # type: ignore[arg-type]
            return "\n".join(lines)
        lines = _render_hierarchical(value, cfg, 0)
        return "\n".join(lines)
    if effective_mode == "key-value":
        if isinstance(value, Mapping):
            lines = _render_key_value(value, cfg, 0)
            return "\n".join(lines)
        lines = _render_hierarchical(value, cfg, 0)
        return "\n".join(lines)
    lines = _render_hierarchical(value, cfg, 0)
    return "\n".join(lines)


def _load_json_from_file(path: str) -> JsonLike:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to input JSON or JSON-LD file")
    parser.add_argument(
        "--mode",
        default="auto",
        choices=["auto", "table", "key-value", "hierarchical"],
        help="Output mode selection",
    )
    parser.add_argument(
        "--table-max-rows",
        type=int,
        default=200,
        help="Maximum number of table rows to render",
    )
    parser.add_argument(
        "--table-max-columns",
        type=int,
        default=40,
        help="Maximum number of table columns to render",
    )
    parser.add_argument(
        "--no-sort-keys",
        action="store_true",
        help="Preserve original object key order instead of sorting keys",
    )
    parser.add_argument(
        "--indent",
        default="  ",
        help="Indentation string used for hierarchical lists",
    )
    parser.add_argument(
        "--bullet",
        default="-",
        help="Bullet prefix used for list items",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    data = _load_json_from_file(args.input)
    config = JsonToMarkdownConfig(
        default_mode=args.mode,
        table_max_rows=args.table_max_rows,
        table_max_columns=args.table_max_columns,
        indent=args.indent,
        bullet=args.bullet,
        sort_keys=not args.no_sort_keys,
    )
    markdown = json_to_markdown(data, config=config, mode=args.mode)
    sys.stdout.write(markdown)
    if not markdown.endswith("\n"):
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
