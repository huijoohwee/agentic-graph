from __future__ import annotations

import re
import hashlib
from typing import Any, Callable, Iterable

from playwright.sync_api import Page
from lib.game_flight_sim_smoke_source_selection import (
    close_source_files_selection_surface,
    prepare_source_files_selection_surface,
)


PRACTICE_SOURCE_WORKSPACE_PATH = (
    "/docs/workspace-seeds/flight-sim-practice/"
    "agentic-graph-game-flight-sim-demo-practice.md"
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
    """Apply a derived practice copy only to the smoke browser's local WorkspaceFs."""
    return page.evaluate(
        """
        async ({expectedSourceText, practiceSourceText, practiceSourcePath}) => {
          const workspaceModule = await window.__kgFlightSimBrowserProof.importModule('workspaceFs')
          const seedBundle = await window.__kgFlightSimBrowserProof.importModule('workspaceCanonicalSeedBundle')
          const demos = await window.__kgFlightSimBrowserProof.importModule('workspaceRunReadyDemos')
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
          const folderPath = sourcePath.slice(0, sourcePath.lastIndexOf('/'))
          const parentPath = folderPath.slice(0, folderPath.lastIndexOf('/')) || '/'
          const folderName = folderPath.slice(folderPath.lastIndexOf('/') + 1)
          const fileName = sourcePath.slice(sourcePath.lastIndexOf('/') + 1)
          let entries = await workspace.listEntries()
          const parent = entries.find(entry => entry.path === parentPath)
          if (!parent || parent.kind !== 'folder') {
            throw new Error(`practice source parent folder is unavailable: ${parentPath}`)
          }
          const folder = entries.find(entry => entry.path === folderPath)
          if (folder && folder.kind !== 'folder') {
            throw new Error(`practice source parent path is not a folder: ${folderPath}`)
          }
          let practiceFolderMaterialized = folder?.kind === 'folder'
          if (!folder) {
            const createdFolderPath = await workspace.createFolder({
              parentPath,
              name: folderName,
              mirrorToHost: false,
            })
            if (createdFolderPath !== folderPath) {
              throw new Error(`practice folder was created at an unexpected path: ${createdFolderPath}`)
            }
            practiceFolderMaterialized = true
          }
          const existing = entries.find(entry => entry.path === sourcePath)
          if (existing && existing.kind !== 'file') {
            throw new Error(`practice source path is not a file: ${sourcePath}`)
          }
          let practiceFileMaterialized = existing?.kind === 'file'
          if (existing) {
            await workspace.writeFileText(sourcePath, practiceSourceText, {mirrorToHost: false})
            practiceFileMaterialized = true
          } else {
            const createdPath = await workspace.createFile({
              parentPath: folderPath,
              name: fileName,
              text: practiceSourceText,
              mirrorToHost: false,
              requireExactPath: true,
            })
            if (createdPath !== sourcePath) {
              throw new Error(`practice source was created at an unexpected path: ${createdPath}`)
            }
            practiceFileMaterialized = true
          }
          const workspaceText = await workspace.readFileText(sourcePath)
          return {
            canonicalSeedByteIdentical: authored?.text === expectedSourceText,
            canonicalWorkspaceBeforeDerivationByteIdentical:
              canonicalWorkspaceText === expectedSourceText,
            practiceWorkspaceByteIdentical: workspaceText === practiceSourceText,
            practiceFolderMaterialized,
            practiceFileMaterialized,
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
            "practiceFolderMaterialized",
            "practiceFileMaterialized",
        )
    ):
        raise AssertionError(
            "isolated practice source did not preserve canonical seed identity: "
            f"{practice_application}"
        )
    prepare_source_files_selection_surface(page)
    refresh = page.get_by_role("button", name="Refresh", exact=True)
    refresh.wait_for(state="visible", timeout=20_000)
    docs = page.get_by_role("button", name="Folder docs", exact=True)
    docs.wait_for(state="visible", timeout=20_000)
    # With the recorded seed selected, Refresh refreshes its remote source. Select
    # the docs root so the same control refreshes the WorkspaceFs inventory.
    docs.click()
    refresh.click(timeout=5_000)
    seeds = page.get_by_role("button", name="Folder workspace-seeds", exact=True)
    practice_folder = page.get_by_role(
        "button", name="Folder flight-sim-practice", exact=True
    )
    docs.wait_for(state="visible", timeout=20_000)
    seeds.wait_for(state="visible", timeout=20_000)
    def expand_folder_if_collapsed(name: str) -> None:
        disclosure = page.get_by_role(
            "button", name=f"Expand folder {name}", exact=True
        )
        if disclosure.count() and disclosure.first.is_visible():
            disclosure.first.click(timeout=5_000)

    expand_folder_if_collapsed("docs")
    expand_folder_if_collapsed("workspace-seeds")
    practice_folder.wait_for(state="visible", timeout=20_000)
    expand_folder_if_collapsed("flight-sim-practice")
    practice_file = page.get_by_role(
        "button", name=f"File {PRACTICE_SOURCE_BASENAME}", exact=True
    )
    practice_file.wait_for(state="visible", timeout=20_000)
    practice_file.click()
    practice_application["uiFileSelection"] = {
        "buttonName": f"File {PRACTICE_SOURCE_BASENAME}",
        "clicked": True,
        "surfaceTransition": close_source_files_selection_surface(page),
    }
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
