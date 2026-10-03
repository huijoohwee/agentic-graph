from __future__ import annotations

from pathlib import Path
import copy
import hashlib
import json
import os
import subprocess
import tempfile
from types import SimpleNamespace
import unittest

from lib.game_flight_sim_smoke_network import (
    assert_authoring_mirror_fixture,
    assert_authoring_mirror_ownership,
    assert_workspace_seed_list_authority,
    read_proof_authoring_mirror_request,
    request_is_proof_local_read,
)


class FlightWorkspaceSeedAuthorityTests(unittest.TestCase):
    def test_bundled_production_seed_requires_no_local_list_request(
        self,
    ) -> None:
        assert_workspace_seed_list_authority(
            requests=[],
            expected_seed_root=Path("/workspace/docs/workspace-seeds"),
        )

    def test_exact_local_seed_root_is_allowed(self) -> None:
        assert_workspace_seed_list_authority(
            requests=[
                {
                    "method": "POST",
                    "path": "/workspace/docs/workspace-seeds",
                }
            ],
            expected_seed_root=Path("/workspace/docs/workspace-seeds"),
        )

    def test_unrelated_or_non_post_root_is_rejected(self) -> None:
        for request in (
            {"method": "POST", "path": "/workspace/docs"},
            {
                "method": "GET",
                "path": "/workspace/docs/workspace-seeds",
            },
            {"method": "POST", "path": ""},
        ):
            with self.subTest(request=request):
                with self.assertRaisesRegex(
                    AssertionError,
                    "unrelated docs mirror",
                ):
                    assert_workspace_seed_list_authority(
                        requests=[request],
                        expected_seed_root=Path(
                            "/workspace/docs/workspace-seeds"
                        ),
                    )


class NativeAuthoringMirrorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        canvas = Path(__file__).resolve().parents[2]
        producer = """import { renderImportInventory } from './src/features/workspace-fs/importInventory.ts';
import { hashStringToHex } from 'grph-shared/hash/stringHash';
const row = { source: 'https://example.test/', status: 'not imported' };
const valid = renderImportInventory([row]);
const body = valid.slice(valid.indexOf('\\n') + 1, -'<!-- /workspace-import-index -->\\n'.length);
const wrap = text => '<!-- workspace-import-index:v2 checksum=' + hashStringToHex(text) + ' -->\\n' + text + '<!-- /workspace-import-index -->\\n';
console.log(JSON.stringify([valid, renderImportInventory([{...row, detail: 'Unicode 😎 | revision & detail'}]),
wrap('# Import index\\n' + 'x'.repeat(400000) + '\\n'), wrap(body.replace('| Status |', '| Arbitrary |')),
renderImportInventory([{...row, source: 'https://outside.test/'}]),
wrap(body.replace('1 known sources', '2 known sources')), wrap(body.replace('| not imported |', '| forged status |'))]))"""
        cls.native_texts = json.loads(subprocess.check_output(
            ["node", "--import", "tsx", "--import", "./scripts/source-authority-test-bootstrap.mjs", "--input-type=module", "-e", producer],
            cwd=canvas, env={**os.environ, "TSX_TSCONFIG_PATH": "tsconfig.json"}, text=True,
        ))

    def setUp(self) -> None:
        self.fixture = tempfile.TemporaryDirectory()
        self.addCleanup(self.fixture.cleanup)
        self.parent = Path(self.fixture.name).resolve()
        self.repository = self.parent / "candidate"
        self.repository.mkdir()
        self.store = self.parent / ".browser-smoke-store-test"
        self.store.mkdir()
        self.output = self.repository / "docs_"
        self.text = self.native_texts[0]
        self.body = {"saveOnly": True, "kind": "file", "outputRoot": str(self.output),
                     "snapshot": {"workspacePath": "/websites/example.test/_import-index.md", "text": self.text}}

    def request(self, body=None, **patch):
        values = {"method": "POST", "url": "http://localhost:4187/__agentic_os_fs_reveal",
                  "headers": {"content-type": "application/json", "origin": "http://localhost:4187", "sec-fetch-site": "same-origin"},
                  "post_data": json.dumps(self.body if body is None else body), "service_worker": None}
        values.update(patch)
        return SimpleNamespace(**values)

    def read(self, request, *, bootstrap_open=True):
        return read_proof_authoring_mirror_request(request, "localhost:4187", self.output, bootstrap_open=bootstrap_open)

    def receipt(self, request):
        target = self.store / request["workspacePath"].lstrip("/")
        return {"workspacePath": request["workspacePath"], "sha256": request["sha256"], "status": 200,
                "contentType": "application/json; charset=utf-8", "result": {"ok": True, "path": str(target), "message": "Saved website document"}}

    def verify(self, requests, receipts):
        return assert_authoring_mirror_ownership(requests=requests, receipts=receipts, store_root=self.store, repository_root=self.repository,
                                                native_workspace_texts={item["workspacePath"]: item["text"] for item in requests})

    def test_bootstrap_save_has_exact_http_and_physical_receipts(self):
        request = self.read(self.request())
        self.assertIsNotNone(request)
        self.assertFalse(request_is_proof_local_read(self.request(), "localhost:4187"))
        target = self.store / request["workspacePath"].lstrip("/")
        target.parent.mkdir(parents=True)
        target.write_text(self.text, encoding="utf-8")
        proof = self.verify([request], [self.receipt(request)])
        self.assertEqual(proof["files"][0]["sha256"], hashlib.sha256(self.text.encode()).hexdigest())
        self.assertEqual(proof["requestCount"], 1)
        self.assertIs(proof["gameplayWritesAllowed"], False)
        self.assertIs(proof["fileManagerAllowed"], False)
        self.assertFalse(self.output.exists())

    def test_gameplay_phase_and_hostile_transports_are_rejected(self):
        self.assertIsNone(self.read(self.request(), bootstrap_open=False))
        for patch in [
            {"method": "GET"}, {"method": "PUT"},
            {"url": "http://localhost:4187/__agentic_os_fs_reveal?x=1"},
            {"url": "http://localhost:4187/__agentic_os_fs_reveal#x"},
            {"url": "https://outside.test/__agentic_os_fs_reveal"},
            {"url": "http://localhost:4187/api/gameplay"},
            {"url": "ws://localhost:4187/__agentic_os_fs_reveal"},
            {"service_worker": object()}, {"post_data": "{"},
            {"headers": {"content-type": "text/plain"}},
            {"headers": {"content-type": "application/json", "origin": "http://outside.test", "sec-fetch-site": "cross-site"}},
        ]:
            with self.subTest(patch=patch):
                self.assertIsNone(self.read(self.request(**patch)))

    def test_only_typed_managed_inventory_snapshots_are_accepted(self):
        mutations = [
            lambda b: b.update(saveOnly=False), lambda b: b.update(saveOnly=1),
            lambda b: b.update(kind="folder"), lambda b: b.update(path="/etc/passwd"),
            lambda b: b.update(outputRoot=str(self.store)), lambda b: b.pop("outputRoot"),
            lambda b: b.update(folderSnapshot={}), lambda b: b["snapshot"].update(extra=True),
            lambda b: b["snapshot"].update(text=42), lambda b: b["snapshot"].update(text="# arbitrary document\n"),
            lambda b: b["snapshot"].update(text=self.text[:-1]),
            lambda b: b["snapshot"].update(text=self.text + "x" * 500_000),
        ]
        bad_paths = ["/websites/../_import-index.md", "/websites/%2e%2e/_import-index.md",
                     "/websites/site/../../escape.md", "/websites/site/page.md", "/game-flight-sim/decisions.md",
                     "/websites//_import-index.md", "/websites/site./_import-index.md", "/websites/con/_import-index.md",
                     "/websites/site\\escape/_import-index.md", "/websites/" + "x" * 65 + "/_import-index.md"]
        for path in bad_paths:
            mutations.append(lambda b, path=path: b["snapshot"].update(workspacePath=path))
        for mutate in mutations:
            body = copy.deepcopy(self.body)
            mutate(body)
            with self.subTest(body_keys=list(body)):
                self.assertIsNone(self.read(self.request(body)))
        duplicate = json.dumps(self.body).replace('"saveOnly": true', '"saveOnly": false, "saveOnly": true')
        self.assertIsNone(self.read(self.request(post_data=duplicate)))

    def test_receipt_mismatch_or_nonisolated_fixture_fails(self):
        request = self.read(self.request())
        receipt = self.receipt(request)
        for mutation in [lambda r: r.update(status=403), lambda r: r.update(contentType="text/html"),
                         lambda r: r["result"].update(ok=False), lambda r: r["result"].update(path=str(self.output)),
                         lambda r: r["result"].update(message="Revealed in Finder"), lambda r: r.update(sha256="0" * 64)]:
            changed = copy.deepcopy(receipt)
            mutation(changed)
            with self.assertRaises(AssertionError):
                self.verify([request], [changed])
        with self.assertRaisesRegex(AssertionError, "one HTTP receipt"):
            self.verify([request], [])
        with self.assertRaisesRegex(AssertionError, "WorkspaceFs source bytes"):
            assert_authoring_mirror_ownership(requests=[request], receipts=[receipt], store_root=self.store,
                                              repository_root=self.repository, native_workspace_texts={})
        target = self.store / request["workspacePath"].lstrip("/")
        target.parent.mkdir(parents=True)
        target.write_text("edited", encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "physical receipt"):
            self.verify([request], [receipt])
        target.unlink()
        other = self.parent / "outside.md"
        other.write_text(self.text, encoding="utf-8")
        target.symlink_to(other)
        with self.assertRaisesRegex(AssertionError, "physical receipt"):
            self.verify([request], [receipt])
        with self.assertRaisesRegex(AssertionError, "owned isolated"):
            assert_authoring_mirror_fixture(self.repository, self.repository)

    def test_latest_native_revision_owns_final_physical_bytes(self):
        first = self.read(self.request())
        body = copy.deepcopy(self.body)
        body["snapshot"]["text"] = self.native_texts[1]
        latest = self.read(self.request(body))
        target = self.store / first["workspacePath"].lstrip("/")
        target.parent.mkdir(parents=True)
        target.write_text(latest["text"], encoding="utf-8")
        proof = self.verify([first, latest], [self.receipt(latest), self.receipt(first)])
        self.assertEqual(proof["files"][0]["sha256"], latest["sha256"])
        self.assertEqual(proof["receiptCount"], 2)

    def test_native_unicode_and_pipe_detail_is_valid(self):
        body = copy.deepcopy(self.body)
        body["snapshot"]["text"] = self.native_texts[1]
        self.assertIn("😎", body["snapshot"]["text"])
        self.assertIn("&#124;", body["snapshot"]["text"])
        request = self.read(self.request(body))
        self.assertIsNotNone(request)
        target = self.store / request["workspacePath"].lstrip("/")
        target.parent.mkdir(parents=True)
        target.write_text(request["text"], encoding="utf-8")
        self.assertEqual(self.verify([request], [self.receipt(request)])["files"][0]["sha256"], request["sha256"])

    def test_forged_managed_markers_checksum_and_interior_are_rejected(self):
        for text in [self.text.replace("known sources", "forged sources"),
                     self.text.replace("checksum=", "checksum=0"),
                     "<!-- workspace-import-index:v2 checksum=01234567 -->\n# Import index\n" + "x" * 400_000 + "<!-- /workspace-import-index -->\n",
                     self.text.replace("https://example.test/", "https://outside.test/"),
                     self.text + "injected trailing bytes", "\ud800", *self.native_texts[2:]]:
            body = copy.deepcopy(self.body)
            body["snapshot"]["text"] = text
            with self.subTest(length=len(text)):
                self.assertIsNone(self.read(self.request(body)))
        with self.assertRaisesRegex(AssertionError, "produced no website mirror"):
            self.verify([], [])


if __name__ == "__main__":
    unittest.main()
