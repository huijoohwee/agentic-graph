import os
import sys
from typing import Optional, Sequence


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = list(argv) if argv is not None else sys.argv[1:]
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    entrypoint = f"{sys.executable} -m knowgrph_parser"

    if args:
        cmd = args[0].strip().lower()
        rest = args[1:]
        if cmd in {"markdown"}:
            from . import markdown_cmd
            return markdown_cmd.main(rest, parser_script_path=entrypoint)
        if cmd in {"codebase-index", "parse-codebase-index"}:
            from . import codebase_index_cmd
            return codebase_index_cmd.main(rest, base_dir=base_dir, parser_script_path=entrypoint)
        if cmd in {"embed-codebase-index"}:
            from . import embed_codebase_index_cmd
            return embed_codebase_index_cmd.main(rest, base_dir=base_dir)
        if cmd in {"test-embedding-sanity"}:
            from . import test_embedding_sanity_cmd
            return test_embedding_sanity_cmd.main(rest, base_dir=base_dir)
        if cmd in {"workflow-artifacts", "parse-knowgrph-workflow"}:
            from . import workflow_artifacts_cmd
            return workflow_artifacts_cmd.main(rest, base_dir=base_dir)
        if cmd in {"jsonld-universal", "parse-jsonld-universal"}:
            from . import jsonld_universal_cmd
            return jsonld_universal_cmd.main(rest)
        if cmd in {"python-codebase-index", "example-codebase-index"}:
            from . import python_codebase_index_cmd
            return python_codebase_index_cmd.main(rest, base_dir=base_dir, parser_script_path=entrypoint)
        if cmd in {"pipeline"}:
            from . import pipeline_cmd
            return pipeline_cmd.main(list(rest))
        if cmd in {"smoke"}:
            from . import smoke_cmd
            return smoke_cmd.main(rest, base_dir=base_dir)
        if cmd in {"graphrag-workflow"}:
            from . import graphrag_workflow_cmd
            return graphrag_workflow_cmd.main(rest, base_dir=base_dir)
        if cmd in {"graphrag-pipeline"}:
            from . import graphrag_pipeline_cmd
            return graphrag_pipeline_cmd.main(rest)
        if cmd in {"superagent", "super-agent", "run-goal"}:
            from . import superagent_harness
            return superagent_harness.main(rest, base_dir=base_dir)
        if cmd in {"youtube"}:
            from . import youtube_cmd
            return youtube_cmd.main(rest, parser_script_path=entrypoint)
        if cmd in {"video-frame", "youtube-frame"}:
            from . import video_frame_cmd
            return video_frame_cmd.main(rest)
        if cmd in {"webpage"}:
            from . import webpage_cmd
            return webpage_cmd.main(rest, parser_script_path=entrypoint)
    from . import markdown_cmd
    return markdown_cmd.main(args, parser_script_path=entrypoint)
