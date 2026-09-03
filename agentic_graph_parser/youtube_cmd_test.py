from .youtube_cmd import (
    _build_youtube_source_url,
    _collect_segments_from_obj,
    _compute_timing_metrics,
    _extract_requested_start_time_s,
    _extract_youtube_video_id,
    _format_transcript_paragraphs,
    _normalize_segments,
    _parse_language_codes,
    _parse_whisper_json_obj,
)


def main() -> int:
    vid = "9uW6B9LPntY"
    if _extract_youtube_video_id(vid) != vid:
        raise SystemExit("video id pass-through failed")
    if _extract_youtube_video_id(f"https://youtu.be/{vid}?t=146") != vid:
        raise SystemExit("youtu.be id extraction failed")
    if _extract_youtube_video_id(f"`https://youtu.be/{vid}?si=abc123`") != vid:
        raise SystemExit("youtu.be id extraction failed (backticks/si)")
    if _extract_youtube_video_id(f"https://www.youtube.com/watch?v={vid}&t=146") != vid:
        raise SystemExit("watch url id extraction failed")
    if _extract_youtube_video_id(f"`https://www.youtube.com/watch?v={vid}&si=abc123&t=146`.") != vid:
        raise SystemExit("watch url id extraction failed (backticks/si/punct)")
    if _extract_youtube_video_id(f"(<https://www.youtube.com/watch?v={vid}>)") != vid:
        raise SystemExit("watch url id extraction failed (parens/angles)")

    if _extract_requested_start_time_s(f"https://youtu.be/{vid}?t=146") != 146:
        raise SystemExit("start time parse (t=146) failed")
    if _extract_requested_start_time_s(f"https://youtu.be/{vid}?t=2m26s") != 146:
        raise SystemExit("start time parse (t=2m26s) failed")
    if _build_youtube_source_url(vid, 0) != f"https://youtu.be/{vid}":
        raise SystemExit("source url build (no t) failed")
    if _build_youtube_source_url(vid, 146) != f"https://youtu.be/{vid}?t=146":
        raise SystemExit("source url build (t) failed")

    codes = _parse_language_codes("JA, en , ko, , EN")
    if codes != ["ja", "en", "ko"]:
        raise SystemExit(f"language code parse failed: {codes}")

    segs2 = [{"text": "Hello", "start": 0.0, "duration": 1.5}, {"text": "OK", "start": 2.0, "duration": 0.5}]
    timing = _compute_timing_metrics(segs2)
    if timing.get("segment_count") != 2:
        raise SystemExit("timing segment_count failed")
    if float(timing.get("end_s") or 0) <= 2.0:
        raise SystemExit("timing end_s failed")

    analysis = {
        "chunks": [
            {"segments": [{"text": "A", "start_ms": 0, "end_ms": 900}]},
            {"segments": [{"text": "B", "start": 1.2, "duration": 0.4}]},
        ]
    }
    segs3 = _collect_segments_from_obj(analysis)
    if len(segs3) != 2:
        raise SystemExit(f"segment collection expected 2, got {len(segs3)}")
    segs3n = _normalize_segments(segs3)
    paras = _format_transcript_paragraphs(segs3n, video_id=vid)
    if f"https://youtu.be/{vid}?t=0" not in paras:
        raise SystemExit("timestamp jump link missing in paragraphs")

    whisper_out = {
        "language": "en",
        "text": "Hello world",
        "segments": [
            {"id": 0, "start": 0.0, "end": 1.2, "text": "Hello"},
            {"id": 1, "start": 1.2, "end": 2.0, "text": "world"},
        ],
    }
    w_segs, w_meta = _parse_whisper_json_obj(whisper_out)
    if len(w_segs) != 2:
        raise SystemExit("whisper segment parse failed")
    if w_meta.get("language") != "en":
        raise SystemExit("whisper language meta parse failed")
    if w_meta.get("transcript_text") != "Hello world":
        raise SystemExit("whisper text meta parse failed")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
