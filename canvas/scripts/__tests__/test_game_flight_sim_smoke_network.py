from __future__ import annotations

from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import copy
import hashlib
import json
import os
import subprocess
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from verify_game_flight_sim_browser_smoke import local_chromium_executable

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
        request = SimpleNamespace(**values)
        request.all_headers = lambda: request.headers
        return request

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

    def test_exact_evidence_fixture_reads_are_local_and_read_only(self):
        origin = "http://localhost:4187"
        fixture = "/evidence-analysis/fixtures/aviation-singapore-multitrack-v1.json"
        for method in ("GET", "HEAD"):
            self.assertTrue(request_is_proof_local_read(
                SimpleNamespace(method=method, url=f"{origin}{fixture}?revision=abc"),
                "localhost:4187",
            ))
        self.assertFalse(request_is_proof_local_read(
            SimpleNamespace(method="POST", url=f"{origin}{fixture}"),
            "localhost:4187",
        ))
        self.assertFalse(request_is_proof_local_read(
            SimpleNamespace(method="GET", url=f"{origin}/evidence-analysis/fixtures/other.json"),
            "localhost:4187",
        ))

    def test_native_production_builder_has_owned_http_and_physical_receipts_without_root(self):
        canvas = Path(__file__).resolve().parents[2]
        producer = """import { createServer } from 'node:http';
import { createWorkspaceRevealHandler } from './viteWorkspaceReveal.ts';
import { createKgFsPathPolicy } from './viteWorkspaceArtifactBridge.ts';
process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = '';
process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL = '1';
process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT = process.argv[2];
const { createMemoryWorkspaceFs } = await import('./src/features/workspace-fs/workspaceFsMemory.ts');
const { persistImportInventory } = await import('./src/features/workspace-fs/importInventoryPersistence.ts');
let opened = 0;
const handler = createWorkspaceRevealHandler(process.argv[1], createKgFsPathPolicy(process.argv[1]), async () => { opened++ });
const server = createServer((req,res) => { void handler(req,res,() => { res.statusCode=404;res.end(); }); });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}`;
globalThis.window = { location: new URL(base), fetch: (...args) => globalThis.fetch(...args) };
const originalFetch = globalThis.fetch, calls = [], fs = createMemoryWorkspaceFs();
globalThis.fetch = async (input,init) => {
  const response = await originalFetch(new URL(String(input),base), {...init,headers:{...init.headers,Origin:base}});
  calls.push({url:new URL(String(input),base).href,body:JSON.parse(init.body),raw:init.body,
    status:response.status,contentType:response.headers.get('content-type'),result:await response.clone().json()});
  return response;
};
try {
  await persistImportInventory(fs,[{source:'https://example.test/',status:'not imported'}]);
  const rejected = [], deniedBody = {...calls[0].body,snapshot:{...calls[0].body.snapshot,workspacePath:'/websites/foreign.test/_import-index.md'}};
  for (const origin of ['null','http://outside.test']) {
    const response = await originalFetch(base+'/__agentic_os_fs_reveal',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(deniedBody)});
    rejected.push({status:response.status,result:await response.json()});
  }
  const crossSite = await originalFetch(base+'/__agentic_os_fs_reveal',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'Sec-Fetch-Site':'cross-site'},body:JSON.stringify(deniedBody)});
  rejected.push({status:crossSite.status,result:await crossSite.json()});
  console.log(JSON.stringify({calls,rejected,opened,workspaceText:await fs.readFileText('/websites/example.test/_import-index.md')}));
} finally { globalThis.fetch=originalFetch;await new Promise(resolve => server.close(resolve)); }
"""
        result = json.loads(subprocess.check_output(
            ["node", "--import", "tsx", "--import", "./scripts/source-authority-test-bootstrap.mjs", "--input-type=module", "-e", producer,
             str(self.repository), str(self.store)], cwd=canvas,
            env={**os.environ, "TSX_TSCONFIG_PATH": "tsconfig.json"}, text=True, timeout=20,
        ))
        self.assertEqual(result["opened"], 0)
        self.assertEqual([receipt["status"] for receipt in result["rejected"]], [403, 403, 403])
        self.assertTrue(all(receipt["result"]["ok"] is False for receipt in result["rejected"]))
        self.assertFalse((self.store / "websites/foreign.test/_import-index.md").exists())
        self.assertEqual(len(result["calls"]), 1)
        call = result["calls"][0]
        self.assertNotIn("outputRoot", call["body"])
        parsed = urlparse(call["url"])
        request = SimpleNamespace(method="POST", url=call["url"], post_data=call["raw"], service_worker=None,
                                  headers={"content-type": "application/json", "origin": f"{parsed.scheme}://{parsed.netloc}", "sec-fetch-site": "same-origin"})
        request.all_headers = lambda: request.headers
        with patch.dict(os.environ, {"AGENTIC_OS_WORKSPACE_STORE_ROOT": str(self.store)}):
            admitted = read_proof_authoring_mirror_request(request, parsed.netloc, self.output, bootstrap_open=True,
                                                         owned_store_root=self.store, repository_root=self.repository)
        self.assertIsNotNone(admitted)
        self.assertEqual(admitted["text"], result["workspaceText"])
        receipt = {key: call[key] for key in ("status", "contentType", "result")}
        receipt.update(workspacePath=admitted["workspacePath"], sha256=admitted["sha256"])
        proof = assert_authoring_mirror_ownership(requests=[admitted], receipts=[receipt], store_root=self.store,
                                                  repository_root=self.repository, native_workspace_texts={admitted["workspacePath"]: result["workspaceText"]})
        self.assertEqual(proof["receiptCount"], 1)
        self.assertFalse(self.output.exists())

    def test_omitted_root_requires_exact_owned_environment_and_diagnostics_are_safe(self):
        body = copy.deepcopy(self.body)
        body.pop("outputRoot")
        request, diagnostic = self.request(body), {}
        with patch.dict(os.environ, {"AGENTIC_OS_WORKSPACE_STORE_ROOT": str(self.store)}):
            self.assertIsNotNone(read_proof_authoring_mirror_request(request, "localhost:4187", self.output, bootstrap_open=True,
                                                                   owned_store_root=self.store, repository_root=self.repository))
            self.assertIsNone(self.read(request))
        for configured in ("", str(self.repository), str(self.parent / "foreign")):
            with patch.dict(os.environ, {"AGENTIC_OS_WORKSPACE_STORE_ROOT": configured}):
                self.assertIsNone(read_proof_authoring_mirror_request(request, "localhost:4187", self.output, bootstrap_open=True,
                                                                    owned_store_root=self.store, repository_root=self.repository, diagnostics=diagnostic))
                self.assertEqual(diagnostic["reason"], "owned-store-contract")
        secret = "DO_NOT_LOG_UNRELATED_PAYLOAD"
        body[secret] = secret
        body["snapshot"]["text"] = secret
        diagnostic = {}
        self.assertIsNone(read_proof_authoring_mirror_request(self.request(body), "localhost:4187", self.output,
                                                            bootstrap_open=True, diagnostics=diagnostic))
        self.assertNotIn(secret, json.dumps(diagnostic))
        self.assertNotIn("text", diagnostic)
        self.assertEqual(diagnostic["reason"], "body-contract")

    def test_missing_fetch_metadata_requires_verified_main_frame_and_header_api(self):
        body = copy.deepcopy(self.body)
        body.pop("outputRoot")
        request = self.request(body, headers={"content-type": "application/json", "origin": "http://localhost:4187"})
        request.frame = SimpleNamespace(url="http://localhost:4187/?kgFlightSimBrowserProof=1", parent_frame=None)
        def read():
            return read_proof_authoring_mirror_request(request, "localhost:4187", self.output, bootstrap_open=True,
                                                      owned_store_root=self.store, repository_root=self.repository)
        with patch.dict(os.environ, {"AGENTIC_OS_WORKSPACE_STORE_ROOT": str(self.store)}):
            self.assertIsNotNone(read())
            for frame in (None, SimpleNamespace(url="http://outside.test/?kgFlightSimBrowserProof=1", parent_frame=None),
                          SimpleNamespace(url="http://localhost:4187/?kgFlightSimBrowserProof=1", parent_frame=object()),
                          SimpleNamespace(url="http://localhost:4187/", parent_frame=None)):
                request.frame = frame
                self.assertIsNone(read())
            request.frame = SimpleNamespace(url="http://localhost:4187/?kgFlightSimBrowserProof=1", parent_frame=None)
            for origin in (None, "null", "http://outside.test"):
                request.headers["origin"] = origin
                self.assertIsNone(read())
            request.headers["origin"] = "http://localhost:4187"
            for site in ("cross-site", "same-site", "none", ""):
                request.headers["sec-fetch-site"] = site
                self.assertIsNone(read())
            request.headers.pop("sec-fetch-site")
            request.all_headers = lambda: (_ for _ in ()).throw(RuntimeError("headers unavailable"))
            self.assertIsNone(read())
            del request.all_headers
            self.assertIsNone(read())

    def test_real_browser_frame_transport_and_opaque_host_rejection(self):
        wire_sites, rejected_wire_sites, observations = [], [], []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass
            def do_GET(self):
                self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers()
                self.wfile.write(b"<!doctype html><title>Frame ownership fixture</title>")
            def do_OPTIONS(self):
                self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "POST"); self.send_header("Access-Control-Allow-Headers", "content-type"); self.end_headers()
            def do_POST(self):
                self.rfile.read(int(self.headers["Content-Length"]))
                wire_sites.append(self.headers.get("Sec-Fetch-Site"))
                if self.headers.get("Origin") != base or self.headers.get("Sec-Fetch-Site") == "cross-site":
                    rejected_wire_sites.append(self.headers.get("Sec-Fetch-Site"))
                    self.send_response(403); self.send_header("Content-Type", "application/json"); self.end_headers()
                    self.wfile.write(b'{"ok":false}'); return
                self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
                self.wfile.write(b'{"ok":true}')
        servers = [ThreadingHTTPServer(("127.0.0.1", 0), Handler) for _ in range(2)]
        threads = [threading.Thread(target=server.serve_forever, daemon=True) for server in servers]
        for thread in threads:
            thread.start()
        body = copy.deepcopy(self.body); body.pop("outputRoot")
        base = f"http://127.0.0.1:{servers[0].server_port}"
        target = base + "/__agentic_os_fs_reveal"
        try:
            with patch.dict(os.environ, {"AGENTIC_OS_WORKSPACE_STORE_ROOT": str(self.store)}), sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True, executable_path=local_chromium_executable())
                context = browser.new_context(service_workers="block")
                def route_request(route, request):
                    if request.method != "POST":
                        route.continue_(); return
                    diagnostic = {}
                    admitted = read_proof_authoring_mirror_request(request, urlparse(base).netloc, self.output, bootstrap_open=True,
                                                                  owned_store_root=self.store, repository_root=self.repository, diagnostics=diagnostic)
                    observations.append((admitted is not None, diagnostic))
                    route.continue_() if admitted is not None else route.abort("blockedbyclient")
                context.route("**/*", route_request)
                page = context.new_page()
                page.goto(base + "/?kgFlightSimBrowserProof=1")
                send = "async ({target,body}) => {try {return (await fetch(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).ok;}catch{return false;}}"
                self.assertTrue(page.evaluate(send, {"target": target, "body": body}))
                page.goto(f"http://127.0.0.1:{servers[1].server_port}/?kgFlightSimBrowserProof=1")
                self.assertFalse(page.evaluate(send, {"target": target, "body": body}))
                page.goto(base + "/?kgFlightSimBrowserProof=1")
                opaque_success = page.evaluate("""async ({target,body}) => new Promise((resolve,reject) => {
                  const timer=setTimeout(()=>reject(Error('opaque iframe fixture timed out')),5000);
                  addEventListener('message',event=>{if(event.data.type==='fixture-done'){clearTimeout(timer);resolve(event.data.success);}},{once:true});
                  const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');
                  const encoded=btoa(JSON.stringify({target,body}));
                  frame.srcdoc='<script>const args=JSON.parse(atob("'+encoded+'"));fetch(args.target,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args.body)}).then(response=>response.ok).catch(()=>false).then(success=>parent.postMessage({type:"fixture-done",success},"*"))<'+'/script>';
                  document.body.append(frame);
                })""", {"target": target, "body": body})
                browser.close()
                self.assertEqual(context.service_workers, [])
            self.assertFalse(opaque_success)
            self.assertTrue(observations[0][0])
            self.assertGreaterEqual(len(observations), 2)
            self.assertTrue(all(not admitted for admitted, _ in observations[1:]))
            self.assertEqual(wire_sites[0], "same-origin")
            self.assertEqual(wire_sites[1:], rejected_wire_sites)
            self.assertTrue(all(site == "cross-site" for site in rejected_wire_sites))
            self.assertTrue(observations[0][1]["mainFrameMatches"])
            for _, diagnostic in observations[1:]:
                self.assertFalse(diagnostic["originMatches"])
                self.assertFalse(diagnostic["mainFrameMatches"])
            print(json.dumps({"schema": "flight-transport-fixture-observation/v1", "authority": False,
                              "serviceWorkersBlocked": True, "interceptedPosts": len(observations),
                              "wirePosts": len(wire_sites), "hostRejectedWirePosts": len(rejected_wire_sites),
                              "opaqueFrameRouteBypassObserved": len(wire_sites) > 1}, sort_keys=True))
        finally:
            for server in servers:
                server.shutdown(); server.server_close()
            for thread in threads:
                thread.join(timeout=2)

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
