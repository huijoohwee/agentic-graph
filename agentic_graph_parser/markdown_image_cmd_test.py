from .graph_builder import parse_markdown_text_to_graph_jsonld


def main() -> int:
    md = """
![mmbiz.qpic.cn](https://mmbiz.qpic.cn/mmbiz_png/gdEn3pxzatSHAib7vomhHSibH0icqO2xD72VBSBEgWDypepymkibpnpmW9iczvnTShtBHPyGRN7MttLwmWbFCIz9MtLKtVxml3cXeO1icZ0DicibLew/640?wx_fmt=png&from=appmsg)
    """.strip()

    out = parse_markdown_text_to_graph_jsonld(md, semantic_enabled=False)
    nodes = out.get("@graph") or []
    edges = [n for n in nodes if isinstance(n, dict) and n.get("@type") == "Edge"]
    real_nodes = [n for n in nodes if isinstance(n, dict) and n.get("@type") != "Edge"]

    images = [n for n in real_nodes if n.get("@type") == "Image"]
    if not images:
        raise SystemExit("missing Image node for markdown ![]()")
    img = images[0]
    props = img.get("properties") or {}
    if props.get("media_kind") != "image":
        raise SystemExit("Image node missing properties.media_kind=image")
    if "mmbiz.qpic.cn" not in str(props.get("media_url") or ""):
        raise SystemExit("Image node missing properties.media_url")

    if not any(e.get("relation") == "embedsImage" and e.get("target") == img.get("@id") for e in edges):
        raise SystemExit("missing embedsImage edge from paragraph to image")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

