from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest

from lib.game_flight_sim_smoke_watchdog import read_partial_evidence, supervise, _processes
from verify_game_flight_sim_browser_smoke import DeferredAuthoringMirrorReceipts, local_chromium_executable
from playwright.sync_api import sync_playwright


class FlightVerifierWatchdogTests(unittest.TestCase):
    def test_normal_success_and_failure_remain_distinct_from_timeout(self):
        for code in (0, 7):
            report = supervise([sys.executable, "-c", f"raise SystemExit({code})"], 5, None)
            self.assertEqual((report["status"], report["exitCode"]), ("exited", code))
            self.assertEqual(report["cleanupSurvivors"], [])
            self.assertNotIn("partialEvidence", report)

    def test_timeout_captures_real_checkpoint_and_kills_detached_descendant_only(self):
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "proof.partial.json"
            value = {"activeVerification": "SourceFiles bootstrap", "verificationLedger": []}
            marker = Path(directory) / "detached.pid"
            descendant = "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(30)"
            command = ("import subprocess,sys,signal,time,pathlib; "
                       "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
                       f"pathlib.Path({str(checkpoint)!r}).write_text({json.dumps(value)!r}); "
                       f"child=subprocess.Popen([sys.executable,'-c',{descendant!r}],start_new_session=True); "
                       f"pathlib.Path({str(marker)!r}).write_text(str(child.pid)); time.sleep(30)")
            foreign = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
            try:
                started = time.monotonic()
                report = supervise([sys.executable, "-c", command], 0.4, checkpoint)
                self.assertLess(time.monotonic() - started, 7)
                self.assertEqual((report["status"], report["exitCode"]), ("timeout", 124))
                self.assertEqual(report["partialEvidence"]["value"], value)
                self.assertGreaterEqual(report["ownedProcessCount"], 2)
                self.assertEqual(report["cleanupSurvivors"], [])
                detached = int(marker.read_text())
                record = _processes().get(detached)
                self.assertTrue(record is None or record[2].startswith("Z"))
                self.assertIsNone(foreign.poll())
            finally:
                foreign.terminate()
                foreign.wait(timeout=3)

    def test_startup_guard_requires_a_new_checkpoint_and_distinguishes_early_stall(self):
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "proof.partial.json"
            checkpoint.write_text('{"activeVerification":"stale","verificationLedger":[]}')
            report = supervise([sys.executable, "-c", "import time; time.sleep(30)"], 5, checkpoint, 0.15)
            self.assertEqual((report["status"], report["exitCode"]), ("startup-timeout", 124))
            self.assertEqual(report["partialEvidence"]["status"], "missing")
            self.assertFalse(checkpoint.exists())
            for delay, startup_limit, expected in ((0.05, 0.5, "exited"), (0.5, 0.1, "startup-timeout")):
                command = (f"import time,pathlib; time.sleep({delay}); "
                           f"pathlib.Path({str(checkpoint)!r}).write_text('{{\"activeVerification\":null,\"verificationLedger\":[]}}'); "
                           "time.sleep(0.6)")
                report = supervise([sys.executable, "-c", command], 5, checkpoint, startup_limit)
                self.assertEqual(report["status"], expected)
                self.assertEqual(checkpoint.exists(), expected == "exited")
            report = supervise([sys.executable, "-c", "import time; time.sleep(0.1)"], 5, None, 0.01)
            self.assertEqual(report["status"], "exited")

    def test_partial_checkpoint_is_optional_bounded_and_never_success(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "partial.json"
            self.assertEqual(read_partial_evidence(path)["status"], "missing")
            path.write_text("not JSON")
            self.assertEqual(read_partial_evidence(path)["status"], "invalid")
            path.write_text("[]")
            self.assertEqual(read_partial_evidence(path)["status"], "invalid")
            path.write_text("x" * 500001)
            self.assertEqual(read_partial_evidence(path)["status"], "invalid")
            self.assertEqual(read_partial_evidence(None)["status"], "not-configured")
        for invalid in (0, -1, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                supervise([sys.executable, "-c", "pass"], invalid, None)


class DeferredAuthoringReceiptTests(unittest.TestCase):
    def test_callbacks_never_decode_and_require_admitted_finished_closed_phase(self):
        collector = DeferredAuthoringMirrorReceipts()
        request, other = object(), object()
        reads = []
        response = SimpleNamespace(request=request, status=200, headers={"content-type": "application/json"},
                                   json=lambda: reads.append(True) or {"ok": True})
        collector.record_response(response)
        self.assertEqual(collector.decode(bootstrap_closed=True), [])
        collector.admit(request, {"workspacePath": "/websites/example.test/_import-index.md", "sha256": "digest"})
        collector.record_response(response)
        collector.record_finished(other)
        self.assertEqual(reads, [])
        with self.assertRaisesRegex(AssertionError, "did not close"):
            collector.decode(bootstrap_closed=False)
        with self.assertRaisesRegex(AssertionError, "did not finish"):
            collector.decode(bootstrap_closed=True)
        collector.record_finished(request)
        self.assertEqual(collector.decode(bootstrap_closed=True)[0]["result"], {"ok": True})
        self.assertEqual(reads, [True])

    def test_real_delayed_http_receipt_decodes_after_requestfinished(self):
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                body = b"<!doctype html><title>Receipt fixture</title>"
                self.send_response(200)
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                self.rfile.read(int(self.headers["Content-Length"]))
                body = b'{"ok":true,"path":"/owned/native-index.md","message":"Saved website document"}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                time.sleep(0.05)
                self.wfile.write(body)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        collector = DeferredAuthoringMirrorReceipts()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True, executable_path=local_chromium_executable())
                context = browser.new_context()

                def route_request(route, request):
                    if request.method == "POST":
                        collector.admit(request, {"workspacePath": "native-index.md", "sha256": "fixture"})
                    route.continue_()

                context.route("**/*", route_request)
                context.on("response", collector.record_response)
                context.on("requestfinished", collector.record_finished)
                page = context.new_page()
                page.goto(f"http://127.0.0.1:{server.server_port}/")
                result = page.evaluate("async () => (await fetch('/save', {method:'POST',body:'native'})).json()")
                self.assertTrue(result["ok"])
                receipts = collector.decode(bootstrap_closed=True)
                self.assertEqual(len(receipts), 1)
                self.assertEqual(receipts[0]["result"], result)
                self.assertEqual(receipts[0]["status"], 200)
                browser.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
