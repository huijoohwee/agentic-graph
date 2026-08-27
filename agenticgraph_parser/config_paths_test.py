import os
import json
import re
import unittest

from .config_paths import (
    CONFIG_ROOT_REL,
    GRAPHRAG_CONFIG_REL,
    UNIVERSAL_ORCHESTRATOR_CONFIG_REL,
    UNIVERSAL_SCHEMA_CONFIG_REL,
    repo_path,
)


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REMOVED_ROOT_CONFIG_DIRS = (
    "configs",
    "llm-chat-config",
    "orchestrator-config",
    "schema-config",
    "trash_rm_scripts",
)
IGNORED_REF_SCAN_DIRS = {
    ".git",
    ".wrangler",
    "dist",
    "node_modules",
    "__pycache__",
}
IGNORED_REF_SCAN_ROOTS_REL = {
    os.path.join("data", "outputs"),
}
TEXT_REF_EXTENSIONS = {
    ".js",
    ".json",
    ".jsonld",
    ".md",
    ".mjs",
    ".py",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
}
TEXT_REF_BASENAMES = {
    ".gitignore",
}
DATA_TEST_DATA_REF_RE = re.compile(r"(?:\.\./)*data/test-data/[A-Za-z0-9._/-]+")
DATA_TEST_DATA_ROOT_REL = os.path.join("data", "test-data")
GRPH_SHARED_PACKAGE_REL = os.path.join("grph-shared", "package.json")
GRPH_SHARED_SRC_REL = os.path.join("grph-shared", "src")
GITIGNORE_REL = ".gitignore"
ACTIVE_DOC_ROOTS_REL = (
    "README.md",
    "CodeWiki.md",
    os.path.join("docs", "documents"),
)
ACTIVE_SOURCE_ROOTS_REL = (
    "canvas/src",
    "grph-shared/src",
    "gympgrph/src",
    "knowgrph_parser",
    "scripts",
)
SANDBOX_GENERATE_VIDEO_ROOT = "/".join(("sandbox", "test-data", "test-generate-video"))
SANDBOX_TEST_DATA_ROOT = "/".join(("sandbox", "test-data"))
SANDBOX_DEMO_ROOT = "/".join(("sandbox", "demo"))
SANDBOX_SIBLING_ALLOW_REF = "".join(("path.resolve(__dirname, '", "../", "../", "sandbox", "')"))
SANDBOX_DIRNAME_ENV_REF = "".join(("KG_", "SANDBOX_DIRNAME"))
SANDBOX_ANCESTOR_SEARCH_REF = "".join(
    ("const starts = [process.cwd(), path.dirname(", "fileURLToPath(import.meta.url)", ")]")
)
DISALLOWED_EXTERNAL_SANDBOX_FIXTURE_REFS = tuple(
    f"{SANDBOX_GENERATE_VIDEO_ROOT}/{filename}"
    for filename in (
        "knowgrph-demo-video.md",
        "knowgrph-rich-media-generation-demo.md",
    )
) + tuple(
    f"{SANDBOX_TEST_DATA_ROOT}/{filename}"
    for filename in (
        "markdown-syntax-computing-flow-sample.md",
        "markdown-syntax-computing-flow-rf-sample.md",
        "singapoly.json",
    )
) + (
    "/".join((SANDBOX_TEST_DATA_ROOT, "test-pdf")),
) + tuple(
    f"{SANDBOX_DEMO_ROOT}/{filename}"
    for filename in (
        "md-demo-00.md",
        "md-demo-01.md",
        "knowgrph-maps-grabmap-multim-demo.md",
    )
)
DISALLOWED_EXTERNAL_SANDBOX_REFS = DISALLOWED_EXTERNAL_SANDBOX_FIXTURE_REFS + (
    SANDBOX_SIBLING_ALLOW_REF,
    SANDBOX_DIRNAME_ENV_REF,
    SANDBOX_ANCESTOR_SEARCH_REF,
)
DISALLOWED_ACTIVE_DOC_SANDBOX_REFS = (
    "sandbox/.knowgrph-workspace",
    "/GitHub/sandbox/",
    "/Users/.../GitHub/sandbox/",
)
DISALLOWED_ACTIVE_DOC_DEMO_STALE_REFS = (
    "canvas/src/__tests__/demo",
    "src/__tests__/demo",
    "runAgenticRagDemo",
    "DEMO_HTML_CONTENT",
    "canvas/src/features/graph/GraphRenderer.tsx",
)
DISALLOWED_RETIRED_TEST_FIXTURE_REFS = (
    f"{SANDBOX_DEMO_ROOT}/markdown-slide-demo.md",
    f"/tmp/{SANDBOX_DEMO_ROOT}/markdown-slide-demo.md",
    f"/tmp/kg-codebase-root/{SANDBOX_DEMO_ROOT}/markdown-slide-demo.md",
    f"/Users/demo/{SANDBOX_DEMO_ROOT}/trip demo.md",
)
DISALLOWED_RETIRED_EXTERNAL_FIXTURE_HELPER_REFS = (
    "".join(("KG_", "SANDBOX", "_ROOT")),
    "".join(("KG_", "SANDBOX", "_DEMO_SUBDIR")),
    "".join(("sandbox", "Root")),
    "".join(("resolve", "Sandbox", "Root")),
    "".join(("pick", "Sandbox", "DemoMarkdownFile")),
    "".join(("read", "Sandbox", "DemoText")),
    "".join(("tests/lib/", "sandbox", "Root")),
)
DISALLOWED_ACTIVE_SYNTHETIC_SANDBOX_DEMO_REFS = (
    f"workspace:/{SANDBOX_DEMO_ROOT}/",
    f"/{SANDBOX_DEMO_ROOT}/",
    f"{SANDBOX_DEMO_ROOT}/",
)
DISALLOWED_ACTIVE_SYNTHETIC_SANDBOX_TEST_DATA_REFS = (
    f"workspace:/{SANDBOX_TEST_DATA_ROOT}/",
    f"/{SANDBOX_TEST_DATA_ROOT}",
    f"{SANDBOX_TEST_DATA_ROOT}/",
)
DISALLOWED_GITIGNORE_STALE_SANDBOX_REFS = (
    "/".join(("sandbox", "test-data")),
    "/".join(("canvas", "sandbox")),
)
DISALLOWED_GITIGNORE_STALE_DEMO_REFS = (
    "airports_full_all_feet.geojson",
    "cities.geojson",
)


def prune_ignored_ref_scan_dirs(dirpath, dirnames):
    dirnames[:] = [
        name
        for name in dirnames
        if name not in IGNORED_REF_SCAN_DIRS
        and os.path.relpath(os.path.join(dirpath, name), REPO_ROOT) not in IGNORED_REF_SCAN_ROOTS_REL
    ]


def iter_text_ref_files():
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        prune_ignored_ref_scan_dirs(dirpath, dirnames)
        for filename in filenames:
            if filename not in TEXT_REF_BASENAMES and os.path.splitext(filename)[1] not in TEXT_REF_EXTENSIONS:
                continue
            yield os.path.join(dirpath, filename)


def iter_data_test_data_text_files():
    root = repo_path(REPO_ROOT, DATA_TEST_DATA_ROOT_REL)
    for dirpath, dirnames, filenames in os.walk(root):
        prune_ignored_ref_scan_dirs(dirpath, dirnames)
        for filename in filenames:
            if os.path.splitext(filename)[1] not in TEXT_REF_EXTENSIONS:
                continue
            yield os.path.join(dirpath, filename)


def iter_active_doc_ref_files():
    for rel_root in ACTIVE_DOC_ROOTS_REL:
        abs_root = repo_path(REPO_ROOT, rel_root)
        if os.path.isfile(abs_root):
            yield abs_root
            continue
        for dirpath, dirnames, filenames in os.walk(abs_root):
            prune_ignored_ref_scan_dirs(dirpath, dirnames)
            for filename in filenames:
                if os.path.splitext(filename)[1] not in TEXT_REF_EXTENSIONS:
                    continue
                yield os.path.join(dirpath, filename)


def iter_active_source_ref_files():
    for rel_root in ACTIVE_SOURCE_ROOTS_REL:
        abs_root = repo_path(REPO_ROOT, rel_root)
        for dirpath, dirnames, filenames in os.walk(abs_root):
            prune_ignored_ref_scan_dirs(dirpath, dirnames)
            for filename in filenames:
                if filename not in TEXT_REF_BASENAMES and os.path.splitext(filename)[1] not in TEXT_REF_EXTENSIONS:
                    continue
                yield os.path.join(dirpath, filename)


class ConfigPathsTest(unittest.TestCase):
    def test_defaults_are_under_data_config(self) -> None:
        self.assertEqual(CONFIG_ROOT_REL, os.path.join("data", "config"))
        for rel_path in (
            GRAPHRAG_CONFIG_REL,
            UNIVERSAL_ORCHESTRATOR_CONFIG_REL,
            UNIVERSAL_SCHEMA_CONFIG_REL,
        ):
            self.assertTrue(rel_path.startswith(CONFIG_ROOT_REL + os.sep), rel_path)
            self.assertFalse(os.path.isabs(rel_path), rel_path)

    def test_default_config_files_exist_at_canonical_paths(self) -> None:
        for rel_path in (
            GRAPHRAG_CONFIG_REL,
            UNIVERSAL_ORCHESTRATOR_CONFIG_REL,
            UNIVERSAL_SCHEMA_CONFIG_REL,
        ):
            self.assertTrue(os.path.isfile(repo_path(REPO_ROOT, rel_path)), rel_path)

    def test_removed_root_config_dirs_do_not_exist(self) -> None:
        for rel_path in REMOVED_ROOT_CONFIG_DIRS:
            self.assertFalse(os.path.exists(repo_path(REPO_ROOT, rel_path)), rel_path)

    def test_data_test_fixture_references_exist(self) -> None:
        missing = []
        for path in iter_text_ref_files():
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            for match in DATA_TEST_DATA_REF_RE.finditer(text):
                rel_path = match.group(0)
                while rel_path.startswith("../"):
                    rel_path = rel_path[3:]
                if not os.path.exists(repo_path(REPO_ROOT, rel_path)):
                    source_rel = os.path.relpath(path, REPO_ROOT)
                    missing.append(f"{source_rel}: {rel_path}")

        self.assertEqual([], sorted(set(missing)))

    def test_external_sandbox_references_are_env_only(self) -> None:
        hardcoded = []
        for path in iter_text_ref_files():
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            for rel_path in DISALLOWED_EXTERNAL_SANDBOX_REFS:
                if rel_path in text:
                    source_rel = os.path.relpath(path, REPO_ROOT)
                    hardcoded.append(f"{source_rel}: {rel_path}")

        self.assertEqual([], sorted(set(hardcoded)))

    def test_repo_test_data_fixtures_do_not_point_to_external_sandbox(self) -> None:
        stale = []
        for path in iter_data_test_data_text_files():
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            for marker in (SANDBOX_DEMO_ROOT, SANDBOX_TEST_DATA_ROOT):
                if marker in text:
                    source_rel = os.path.relpath(path, REPO_ROOT)
                    stale.append(f"{source_rel}: {marker}")

        self.assertEqual([], sorted(set(stale)))

    def test_active_docs_do_not_point_to_sandbox_artifact_roots(self) -> None:
        stale = []
        for path in iter_active_doc_ref_files():
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            for marker in DISALLOWED_ACTIVE_DOC_SANDBOX_REFS:
                if marker in text:
                    source_rel = os.path.relpath(path, REPO_ROOT)
                    stale.append(f"{source_rel}: {marker}")

        self.assertEqual([], sorted(set(stale)))

    def test_active_docs_do_not_point_to_removed_demo_runner_files(self) -> None:
        stale = []
        for path in iter_active_doc_ref_files():
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            for marker in DISALLOWED_ACTIVE_DOC_DEMO_STALE_REFS:
                if marker in text:
                    source_rel = os.path.relpath(path, REPO_ROOT)
                    stale.append(f"{source_rel}: {marker}")

        self.assertEqual([], sorted(set(stale)))

    def test_retired_test_fixture_paths_do_not_return(self) -> None:
        stale = []
        for path in iter_text_ref_files():
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            for marker in DISALLOWED_RETIRED_TEST_FIXTURE_REFS:
                if marker in text:
                    source_rel = os.path.relpath(path, REPO_ROOT)
                    stale.append(f"{source_rel}: {marker}")

        self.assertEqual([], sorted(set(stale)))

    def test_retired_external_fixture_helper_names_do_not_return(self) -> None:
        stale = []
        for path in iter_text_ref_files():
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            for marker in DISALLOWED_RETIRED_EXTERNAL_FIXTURE_HELPER_REFS:
                if marker in text:
                    source_rel = os.path.relpath(path, REPO_ROOT)
                    stale.append(f"{source_rel}: {marker}")

        self.assertEqual([], sorted(set(stale)))

    def test_active_synthetic_document_ids_do_not_use_sandbox_demo_roots(self) -> None:
        stale = []
        for path in iter_text_ref_files():
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            for marker in DISALLOWED_ACTIVE_SYNTHETIC_SANDBOX_DEMO_REFS:
                if marker in text:
                    source_rel = os.path.relpath(path, REPO_ROOT)
                    stale.append(f"{source_rel}: {marker}")

        self.assertEqual([], sorted(set(stale)))

    def test_active_source_workspace_ids_do_not_use_sandbox_test_data_roots(self) -> None:
        stale = []
        for path in iter_active_source_ref_files():
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            for marker in DISALLOWED_ACTIVE_SYNTHETIC_SANDBOX_TEST_DATA_REFS:
                if marker in text:
                    source_rel = os.path.relpath(path, REPO_ROOT)
                    stale.append(f"{source_rel}: {marker}")

        self.assertEqual([], sorted(set(stale)))

    def test_gitignore_does_not_keep_removed_sandbox_roots_or_demo_files(self) -> None:
        gitignore_path = repo_path(REPO_ROOT, GITIGNORE_REL)
        with open(gitignore_path, "r", encoding="utf-8") as handle:
            text = handle.read()

        stale = [
            marker
            for marker in DISALLOWED_GITIGNORE_STALE_SANDBOX_REFS + DISALLOWED_GITIGNORE_STALE_DEMO_REFS
            if marker in text
        ]

        self.assertEqual([], stale)

    def test_grph_shared_package_exports_match_source_modules(self) -> None:
        package_path = repo_path(REPO_ROOT, GRPH_SHARED_PACKAGE_REL)
        with open(package_path, "r", encoding="utf-8") as handle:
            package_json = json.load(handle)

        exports = package_json.get("exports") or {}
        exported_modules = {
            key[2:]
            for key in exports.keys()
            if isinstance(key, str) and key.startswith("./")
        }
        source_modules = set()
        source_root = repo_path(REPO_ROOT, GRPH_SHARED_SRC_REL)
        for dirpath, _dirnames, filenames in os.walk(source_root):
            for filename in filenames:
                if not filename.endswith((".ts", ".tsx")):
                    continue
                rel_path = os.path.relpath(os.path.join(dirpath, filename), source_root)
                source_modules.add(os.path.splitext(rel_path)[0].replace(os.sep, "/"))

        self.assertEqual([], sorted(source_modules - exported_modules))
        self.assertEqual([], sorted(exported_modules - source_modules))


if __name__ == "__main__":
    unittest.main()
