from __future__ import annotations

import io
import json
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_ROOT))

from lib.game_flight_sim_smoke_city_regional_poi import (  # noqa: E402
    require_city_regional_poi_teardown_contract,
)
from lib.game_flight_sim_smoke_bootstrap import BoundedEvaluationPage  # noqa: E402
from lib.game_flight_sim_smoke_ledger import BrowserVerificationLedger  # noqa: E402


class JavaScriptEvaluationPage:
    """Execute the actual adapter JavaScript without a second browser gate."""

    def __init__(self) -> None:
        self.last_argument = None
        self.native_attribute = object()

    def evaluate(self, expression, arg=None):
        self.last_argument = arg
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", """
              import fs from 'node:fs';
              const input = JSON.parse(fs.readFileSync(0, 'utf8'));
              try {
                const value = await globalThis.eval(input.expression)(input.arg);
                console.log(JSON.stringify({ value }));
              } catch (error) {
                console.error(error.message);
                process.exitCode = 1;
              }
            """],
            input=json.dumps({"expression": expression, "arg": arg}),
            capture_output=True, text=True, timeout=2, check=False,
        )
        if completed.returncode:
            raise RuntimeError(completed.stderr.strip())
        return json.loads(completed.stdout).get("value")


class FlightBoundedEvaluationTest(unittest.TestCase):
    def test_function_argument_and_result_are_preserved(self) -> None:
        native = JavaScriptEvaluationPage()
        page = BoundedEvaluationPage(native)
        argument = {"nested": [1, None, False], "name": "quoted ' value"}
        for expression in (
            "async value => ({ argument: value, answer: 42 })",
            "function(value) { return { argument: value, answer: 42 }; }",
            "async function(value) { return { argument: value, answer: 42 }; }",
        ):
            with self.subTest(expression=expression):
                self.assertEqual(page.evaluate(expression, argument), {
                    "argument": argument, "answer": 42,
                })
                self.assertIs(native.last_argument, argument)
        self.assertIs(page.native_attribute, native.native_attribute)

    def test_nonfunction_values_promises_and_statements_are_preserved(self) -> None:
        page = BoundedEvaluationPage(JavaScriptEvaluationPage())
        for expression, expected in (
            ("({ answer: 42 })", {"answer": 42}),
            ("Promise.resolve({ answer: 43 })", {"answer": 43}),
            ("false", False),
            ("undefined", None),
            ("globalThis.calls = (globalThis.calls || 0) + 1; globalThis.calls", 1),
        ):
            with self.subTest(expression=expression):
                self.assertEqual(page.evaluate(expression), expected)

    def test_native_rejection_and_runtime_syntax_error_are_not_replaced(self) -> None:
        page = BoundedEvaluationPage(JavaScriptEvaluationPage())
        for expression, message in (
            ("async () => { throw new Error('native rejection'); }", "native rejection"),
            ("() => { throw new SyntaxError('native syntax'); }", "native syntax"),
        ):
            with self.subTest(expression=expression):
                with self.assertRaisesRegex(RuntimeError, message):
                    page.evaluate(expression)

    def test_unfinished_function_and_nonfunction_promises_reject(self) -> None:
        page = BoundedEvaluationPage(JavaScriptEvaluationPage(), timeout_ms=25)
        for expression in (
            "async () => await new Promise(() => {})",
            "new Promise(() => {})",
        ):
            with self.subTest(expression=expression):
                started = time.monotonic()
                with self.assertRaisesRegex(
                    RuntimeError,
                    r"Page.evaluate exceeded 25ms at .*presentation.py:\d+",
                ):
                    page.evaluate(expression)
                self.assertLess(time.monotonic() - started, 1)

    def test_cannot_disable_or_extend_production_deadline(self) -> None:
        for timeout in (0, -1, 30_001, True, 1.5):
            with self.subTest(timeout=timeout):
                with self.assertRaises(ValueError):
                    BoundedEvaluationPage(JavaScriptEvaluationPage(), timeout_ms=timeout)


class FlightPartialLedgerTest(unittest.TestCase):
    def test_checkpoint_exposes_in_flight_and_completed_real_phase(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "proof.partial.json"
            output = io.StringIO()
            ledger = BrowserVerificationLedger(checkpoint_path=path)

            def check():
                self.assertEqual(json.loads(path.read_text()), {
                    "activeVerification": "real operation",
                    "verificationLedger": [],
                })
                return {"real": "result"}

            with redirect_stdout(output):
                self.assertEqual(ledger.verify("real operation", check), {"real": "result"})
            self.assertEqual(json.loads(path.read_text()), {
                "activeVerification": None,
                "verificationLedger": [{"name": "real operation", "status": "passed"}],
            })
            self.assertIn("phase-start] real operation", output.getvalue())
            self.assertIn("phase-passed] real operation", output.getvalue())
            self.assertFalse(path.with_name(path.name + ".tmp").exists())

    def test_failure_and_dependencies_remain_failed_and_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "proof.partial.json"
            ledger = BrowserVerificationLedger(checkpoint_path=path)

            def fail():
                raise TimeoutError("actual evaluate deadline")

            with patch("builtins.print") as printed:
                self.assertIsNone(ledger.verify("source", fail))
                self.assertIsNone(ledger.verify(
                    "dependent", lambda: self.fail("must not execute"),
                    depends_on=("source",),
                ))
            self.assertTrue(all(call.kwargs.get("flush") for call in printed.call_args_list))
            partial = json.loads(path.read_text())
            self.assertIsNone(partial["activeVerification"])
            self.assertEqual(partial["verificationLedger"], ledger.evidence())
            self.assertEqual(ledger.evidence(), [
                {"name": "source", "status": "failed", "errorType": "TimeoutError",
                 "message": "actual evaluate deadline"},
                {"name": "dependent", "status": "skipped", "blockedBy": ["source"]},
            ])
            with self.assertRaisesRegex(AssertionError, "FAILED source"):
                ledger.assert_success(expected_names=("source", "dependent"))


class FlightGeoXrCityDisposalAuditTest(unittest.TestCase):
    def observe(self, value):
        class TeardownPage:
            def evaluate(self, expression):
                return value

            def wait_for_timeout(self, delay):
                pass

        with patch(
            "lib.game_flight_sim_smoke_city_regional_poi.time.monotonic",
            side_effect=(0, 0, 31),
        ):
            return require_city_regional_poi_teardown_contract(TeardownPage())

    def test_accepts_absent_source_layers_and_evidence(self) -> None:
        observed = {
            "expectedLayerCount": 5, "sourcePresent": False,
            "presentLayerIds": [], "presentEvidenceKeys": [],
        }
        self.assertEqual(self.observe(observed), observed)

    def test_rejects_present_unsettled_nonempty_or_missing_owned_data(self) -> None:
        absent = {
            "expectedLayerCount": 5, "sourcePresent": False,
            "presentLayerIds": [], "presentEvidenceKeys": [],
        }
        for mutation in (
            {"sourcePresent": True, "features": 0, "loaded": True},
            {"sourcePresent": True, "features": 0, "loaded": False},
            {"sourcePresent": True, "features": 1, "loaded": True},
            {"presentLayerIds": ["surviving-owned-layer"]},
            {"presentEvidenceKeys": ["surviving-owned-evidence"]},
            {"expectedLayerCount": 0},
        ):
            with self.subTest(mutation=mutation):
                with self.assertRaisesRegex(AssertionError, "survived teardown"):
                    self.observe({**absent, **mutation})
        with self.assertRaisesRegex(AssertionError, "survived teardown"):
            self.observe({})


if __name__ == "__main__":
    unittest.main()
