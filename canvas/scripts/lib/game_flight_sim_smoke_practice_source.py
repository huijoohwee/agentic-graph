from __future__ import annotations

import re
import hashlib
from typing import Any, Callable, Iterable

from playwright.sync_api import Page


PRACTICE_SOURCE_WORKSPACE_PATH = (
    "/flight-sim-practice/agentic-graph-game-flight-sim-demo-practice.md"
)
PRACTICE_SOURCE_BASENAME = "agentic-graph-game-flight-sim-demo-practice.md"
_FRONTMATTER_DELIMITER = re.compile(r"^---[ \t]*(?:\r?\n|$)")
_RECORDED_SOURCE_KEY = re.compile(r"^source_geospatial:[ \t]*\r?\n$")


def derive_flight_practice_source(source_text: str) -> str:
    """Remove only the authored Recorded-source mapping for isolated practice."""
    lines = source_text.splitlines(keepends=True)
    if not lines or not _FRONTMATTER_DELIMITER.fullmatch(lines[0]):
        raise ValueError("Flight source has no YAML frontmatter opener")
    closing_index = next(
        (
            index
            for index, line in enumerate(lines[1:], start=1)
            if _FRONTMATTER_DELIMITER.fullmatch(line)
        ),
        None,
    )
    if closing_index is None:
        raise ValueError("Flight source has no YAML frontmatter closer")
    matches = [
        index
        for index, line in enumerate(lines[1:closing_index], start=1)
        if line.startswith("source_geospatial:")
        and not line.startswith((" ", "\t"))
    ]
    if len(matches) != 1:
        raise ValueError("Flight source must declare one Recorded source mapping")
    start = matches[0]
    if not _RECORDED_SOURCE_KEY.fullmatch(lines[start]):
        raise ValueError("Flight Recorded source intent must be a YAML mapping")
    end = start + 1
    while end < closing_index and lines[end].startswith((" ", "\t")):
        end += 1
    if end == start + 1:
        raise ValueError("Flight Recorded source mapping must contain fields")
    if end < closing_index and not lines[end].strip():
        end += 1
    del lines[start:end]
    derived = "".join(lines)
    if re.search(r"(?m)^source_geospatial:", derived):
        raise ValueError("Flight practice derivation retained Recorded source intent")
    return derived


def apply_isolated_practice_source(
    page: Page,
    *,
    expected_source_text: str,
    practice_source_text: str,
) -> dict[str, Any]:
    """Apply a derived practice copy in the smoke browser's isolated WorkspaceFs."""
    return page.evaluate(
        """
        async ({expectedSourceText, practiceSourceText, practiceSourcePath}) => {
          const explorer = await window.__kgFlightSimBrowserProof.importModule('markdownExplorerStore')
          const materialization = await window.__kgFlightSimBrowserProof.importModule('sourceFilesRuntimeMaterialization')
          const workspaceModule = await window.__kgFlightSimBrowserProof.importModule('workspaceFs')
          const seedBundle = await window.__kgFlightSimBrowserProof.importModule('workspaceCanonicalSeedBundle')
          const demos = await window.__kgFlightSimBrowserProof.importModule('workspaceRunReadyDemos')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const workspace = await workspaceModule.getWorkspaceFs()
          await workspace.ensureSeed()
          const canonicalSourcePath = `/${demos.FLIGHT_SIM_DEMO_REPO_REL_PATH}`
          const sourcePath = practiceSourcePath
          const sourceBasename = demos.FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME
          const authoredSeeds = await seedBundle.readCanonicalWorkspaceSeedBundleEntries()
          const authored = authoredSeeds.find(seed => {
            const path = String(seed?.relPath || '').replace(/^\\/+/, '')
            return path === sourceBasename
              || path === `workspace-seeds/${sourceBasename}`
              || path === `docs/workspace-seeds/${sourceBasename}`
          })
          if (authored?.text !== expectedSourceText) {
            throw new Error('bundled canonical Flight seed changed before practice derivation')
          }
          const canonicalWorkspaceText = await workspace.readFileText(canonicalSourcePath)
          if (canonicalWorkspaceText !== expectedSourceText) {
            throw new Error('WorkspaceFs canonical Flight seed changed before practice derivation')
          }
          await workspace.writeFileText(sourcePath, practiceSourceText, {mirrorToHost: false})
          const workspaceText = await workspace.readFileText(sourcePath)
          explorer.useMarkdownExplorerStore.getState().setActivePath(sourcePath)
          const applied = await materialization.reapplyActiveWorkspaceMarkdownDocument({
            activePathOverride: sourcePath,
            fs: workspace,
          })
          const state = store.useGraphStore.getState()
          return {
            applied,
            canonicalSeedByteIdentical: authored?.text === expectedSourceText,
            canonicalWorkspaceBeforeDerivationByteIdentical:
              canonicalWorkspaceText === expectedSourceText,
            practiceWorkspaceByteIdentical: workspaceText === practiceSourceText,
            activeDocumentByteIdentical:
              state.markdownDocumentText === practiceSourceText,
            documentName: state.markdownDocumentName,
            sourcePath,
          }
        }
        """,
        {
            "expectedSourceText": expected_source_text,
            "practiceSourceText": practice_source_text,
            "practiceSourcePath": PRACTICE_SOURCE_WORKSPACE_PATH,
        },
    )


def apply_and_verify_practice_source(
    page: Page,
    *,
    expected_source_text: str,
    expected_source_sha256: str,
    source_basename: str,
    source_demo_id: str,
    expected_node_ids: Iterable[str],
    poll: Callable[..., dict[str, Any]],
    read_identity: Callable[[str | None, str | None], dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Prove canonical Recorded intent stays inactive before isolated practice."""
    practice_source_text = derive_flight_practice_source(expected_source_text)
    practice_source_sha256 = hashlib.sha256(
        practice_source_text.encode("utf-8")
    ).hexdigest()
    recorded_source = poll(
        page,
        lambda: read_identity(None, None),
        lambda value: (
            str(value.get("documentName") or "").endswith(source_basename)
            and value.get("demoId") == source_demo_id
            and value.get("active") is True
            and value.get("flightAdmissionObserved") is True
            and value.get("flightAdmissionActive") is False
            and value.get("flightRuntimeActive") is False
            and value.get("authoredSeedByteIdentical") is True
            and value.get("authoredSeedHasRecordedSourceIntent") is True
            and value.get("workspaceSourceByteIdentical") is True
            and value.get("workspaceSourceHasRecordedSourceIntent") is True
            and value.get("workspaceSourceSha256") == expected_source_sha256
        ),
        label="canonical Recorded Flight source remains practice-inactive",
    )
    practice_application = apply_isolated_practice_source(
        page,
        expected_source_text=expected_source_text,
        practice_source_text=practice_source_text,
    )
    if not all(
        practice_application.get(key) is True
        for key in (
            "canonicalSeedByteIdentical",
            "canonicalWorkspaceBeforeDerivationByteIdentical",
            "practiceWorkspaceByteIdentical",
            "activeDocumentByteIdentical",
        )
    ):
        raise AssertionError(
            "isolated practice source did not preserve canonical seed identity: "
            f"{practice_application}"
        )
    source = poll(
        page,
        lambda: read_identity(
            practice_source_text,
            PRACTICE_SOURCE_WORKSPACE_PATH,
        ),
        lambda value: (
            str(value.get("documentName") or "").endswith(PRACTICE_SOURCE_BASENAME)
            and str(value.get("sourcePath") or "").endswith(PRACTICE_SOURCE_BASENAME)
            and value.get("demoId") == source_demo_id
            and value.get("active") is True
            and value.get("flightAdmissionObserved") is True
            and value.get("flightAdmissionActive") is True
            and value.get("flightRuntimeActive") is True
            and value.get("sourceDeclaration") is True
            and value.get("authoredSeedByteIdentical") is True
            and value.get("authoredSeedSha256") == expected_source_sha256
            and value.get("authoredSeedHasRecordedSourceIntent") is True
            and value.get("workspaceSourceMaterialized") is True
            and value.get("workspaceSourceByteIdentical") is True
            and value.get("workspaceSourceHasRecordedSourceIntent") is False
            and value.get("workspaceSourceSha256") == practice_source_sha256
            and value.get("expectedSourceSha256") == expected_source_sha256
            and value.get("expectedWorkspaceSourceSha256")
            == practice_source_sha256
            and value.get("graphOwnedByDocument") is True
            and all((value.get("sourceContract") or {}).values())
            and str(value.get("graphDocumentName") or "").endswith(
                PRACTICE_SOURCE_BASENAME
            )
            and set(expected_node_ids).issubset(
                set(value.get("graphNodeIds") or [])
            )
            and value.get("surfaceMode") == "geo-xr"
            and value.get("renderMode") == "3d"
            and value.get("canvas3dMode") == "xr"
        ),
        label="authored canonical seed plus derived practice source materialization",
    )
    source["practiceSourceSha256"] = practice_source_sha256
    source["practiceSourcePath"] = PRACTICE_SOURCE_WORKSPACE_PATH
    source["canonicalRecordedSourceSha256"] = recorded_source.get(
        "workspaceSourceSha256"
    )
    source["practiceSourceDerivedFromAuthoredSeed"] = True
    source["canonicalRecordedSourceStayedInactive"] = (
        recorded_source.get("flightAdmissionActive") is False
        and recorded_source.get("flightRuntimeActive") is False
    )
    return recorded_source, practice_application | {
        "practiceSourceSha256": practice_source_sha256,
        "practiceSourceDerivedFromAuthoredSeed": True,
    }, source
