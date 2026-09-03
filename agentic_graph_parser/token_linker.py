import re
from typing import Any, Dict, List, Tuple
from .config_utils import clamp01

_WORD_RE = re.compile(r"[A-Za-z0-9_]+")
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")

def tokenize_with_offsets(text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for m in _WORD_RE.finditer(text or ""):
        tok = m.group(0) or ""
        if not tok:
            continue
        start = int(m.start())
        end = int(m.end())
        is_word = any(c.isalpha() for c in tok)
        kind = "word" if is_word else "num"
        out.append({"text": tok, "start": start, "end": end, "kind": kind})
    return out


def token_kind_score(token: str) -> Tuple[str, float]:
    if not token:
        return "other", 0.5
    if token.isupper() and any(c.isalpha() for c in token):
        return "upper", 0.85
    if token[:1].isupper() and any(c.isalpha() for c in token):
        return "capitalized", 0.8
    if "_" in token or "." in token:
        return "identifier", 0.8
    if any(c.isalpha() for c in token) and any(c.isupper() for c in token[1:]):
        return "identifier", 0.75
    return "word", 0.55


def merge_tokens_to_spans(
    tokens: List[Dict[str, Any]],
    *,
    phrase_boundary_threshold: float,
    max_entity_span_tokens: int,
    coreference_distance_limit: int = 5,
) -> List[Dict[str, Any]]:
    spans: List[Dict[str, Any]] = []
    i = 0
    while i < len(tokens):
        t0 = tokens[i]
        tok = str(t0.get("text") or "")
        kind0, base0 = token_kind_score(tok)
        if kind0 not in {"capitalized", "upper", "identifier"}:
            i += 1
            continue
        start_i = i
        end_i = i + 1
        best_score = base0
        while end_i < len(tokens) and (end_i - start_i) < max_entity_span_tokens:
            prev = str(tokens[end_i - 1].get("text") or "")
            cur = str(tokens[end_i].get("text") or "")
            pk, ps = token_kind_score(prev)
            ck, cs = token_kind_score(cur)
            coherence = 0.9 if pk == ck and pk in {"capitalized", "upper", "identifier"} else 0.6
            if coherence < phrase_boundary_threshold:
                break
            end_i += 1
            best_score = max(best_score, (ps + cs + coherence) / 3.0)
        span_tokens = tokens[start_i:end_i]
        text = " ".join([str(t.get("text") or "") for t in span_tokens]).strip()
        if text:
            spans.append(
                {
                    "text": text,
                    "start": int(span_tokens[0].get("start") or 0),
                    "end": int(span_tokens[-1].get("end") or 0),
                    "tokenStart": start_i,
                    "tokenEnd": end_i - 1,
                    "confidence": clamp01(float(best_score)),
                }
            )
        i = end_i
    return spans


def detect_inline_code_spans(text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for m in _INLINE_CODE_RE.finditer(text or ""):
        inner = (m.group(1) or "").strip()
        if not inner:
            continue
        out.append(
            {
                "text": inner,
                "start": int(m.start(1)),
                "end": int(m.end(1)),
                "tokenStart": None,
                "tokenEnd": None,
                "confidence": 0.9,
            }
        )
    return out
