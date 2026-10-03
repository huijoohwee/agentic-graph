import argparse
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from . import video_frame_cmd as frames
from . import video_frame_worker as worker


class VideoFrameWorkerTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.output_root = os.path.join(self.temporary.name, "frames")
        self.input_root = os.path.join(self.temporary.name, "private-input")
        os.makedirs(self.output_root)

    def job(self, index, timestamp=None):
        return {"id": str(index), "timeSeconds": index + 0.125 if timestamp is None else timestamp,
                "format": "png", "outputPath": os.path.join(self.output_root, f"frame-abc-t{index}.png")}

    def run_jobs(self, jobs):
        output = io.StringIO()
        worker.run_worker(url="https://example.test/source", output_root=self.output_root,
                          input_root=self.input_root, timeout_s=75,
                          input_stream=io.StringIO("".join(json.dumps(job) + "\n" for job in jobs)),
                          output_stream=output)
        return [json.loads(line) for line in output.getvalue().splitlines()]

    def test_sixteen_jobs_share_source_and_download_with_two_active_extracts(self):
        counts = {"resolve": 0, "download": 0, "active": 0, "maximum": 0}
        seen_times = []
        lock = threading.Lock()

        def resolve(*args, **kwargs):
            counts["resolve"] += 1
            time.sleep(0.005)
            return "https://example.test/direct-stream", {"Authorization": "private-session-header"}

        def download(url, *, output_dir, timeout_s):
            counts["download"] += 1
            target = os.path.join(output_dir, "source.mp4")
            with open(target, "wb") as file:
                file.write(b"local source")
            return target

        def extract(**args):
            with lock:
                counts["active"] += 1
                counts["maximum"] = max(counts["maximum"], counts["active"])
            try:
                if args["input_url"].startswith("https:"):
                    return 1, "", "remote seeking unavailable"
                self.assertEqual(args["headers"], {})
                timestamp = args["pre_seek_s"] + args["accurate_offset_s"]
                seen_times.append(timestamp)
                time.sleep(0.04 if timestamp > 15 else 0.006)
                with open(args["output_path"], "wb") as file:
                    file.write(b"png fixture")
                return 0, "", ""
            finally:
                with lock:
                    counts["active"] -= 1

        with patch.object(frames, "_pick_stream", side_effect=resolve), \
                patch.object(frames, "_download_video_for_frame", side_effect=download), \
                patch.object(frames, "_ffmpeg_cmd", return_value="fixture-ffmpeg"), \
                patch.object(frames, "_run_ffmpeg_frame_extract", side_effect=extract):
            results = self.run_jobs([self.job(index) for index in range(16)])
        self.assertEqual((counts["resolve"], counts["download"], counts["maximum"]), (1, 1, 2))
        self.assertEqual(len(results), 16)
        self.assertTrue(all(result["ok"] for result in results))
        self.assertEqual(sorted(seen_times), [index + 0.125 for index in range(16)])
        self.assertLess(next(i for i, result in enumerate(results) if result["id"] == "0"),
                        next(i for i, result in enumerate(results) if result["id"] == "15"))
        self.assertTrue(all("private-session-header" not in json.dumps(result) for result in results))
        self.assertEqual(os.listdir(self.input_root), ["source.mp4"])

    def test_new_cohort_reuses_the_source_until_eof(self):
        ready = threading.Event()
        first_finished = threading.Event()
        first_job = self.job(0)
        second_job = self.job(1)

        class Cohorts(io.StringIO):
            calls = 0
            def readline(self, size=-1):
                self.calls += 1
                if self.calls == 1:
                    return json.dumps(first_job) + "\n"
                if self.calls == 2:
                    self.assert_ready = first_finished.wait(2)
                    return json.dumps(second_job) + "\n"
                return ""

        class CompletionOutput(io.StringIO):
            def flush(self):
                if '"id":"0"' in self.getvalue():
                    first_finished.set()

        def extract(**args):
            with open(args["output_path"], "wb") as file:
                file.write(b"frame")
            ready.set()
            return 0, "", ""

        with patch.object(frames, "_pick_stream", return_value=("https://example.test/stream", {})) as resolve, \
                patch.object(frames, "_ffmpeg_cmd", return_value="fixture"), \
                patch.object(frames, "_run_ffmpeg_frame_extract", side_effect=extract):
            output = CompletionOutput()
            input_stream = Cohorts()
            worker.run_worker(url="https://example.test/source", output_root=self.output_root,
                              input_root=self.input_root, timeout_s=75,
                              input_stream=input_stream, output_stream=output)
        self.assertTrue(input_stream.assert_ready)
        self.assertTrue(ready.is_set())
        self.assertEqual(resolve.call_count, 1)
        self.assertEqual(len(output.getvalue().splitlines()), 2)

    def test_source_and_download_errors_are_cached_for_the_session(self):
        jobs = [self.job(index) for index in range(16)]
        with patch.object(frames, "_pick_stream", side_effect=RuntimeError("provider unavailable")) as resolve:
            results = self.run_jobs(jobs)
        self.assertEqual(resolve.call_count, 1)
        self.assertTrue(all(not result["ok"] and result["error"] == "provider unavailable" for result in results))
        with patch.object(frames, "_pick_stream", return_value=("https://example.test/stream", {})), \
                patch.object(frames, "_ffmpeg_cmd", return_value="fixture"), \
                patch.object(frames, "_run_ffmpeg_frame_extract", return_value=(1, "", "failed")), \
                patch.object(frames, "_download_video_for_frame", side_effect=RuntimeError("download rejected")) as download:
            results = self.run_jobs(jobs)
        self.assertEqual(download.call_count, 1)
        self.assertTrue(all(not result["ok"] and result["error"] == "download rejected" for result in results))

    def test_oversized_fallback_is_rejected_once_and_removed(self):
        def download(url, *, output_dir, timeout_s):
            target = os.path.join(output_dir, "source.mp4")
            with open(target, "wb") as file:
                file.write(b"too many bytes")
            return target
        with patch.object(frames, "_pick_stream", return_value=("https://example.test/stream", {})), \
                patch.object(frames, "_ffmpeg_cmd", return_value="fixture"), \
                patch.object(frames, "_run_ffmpeg_frame_extract", return_value=(1, "", "failed")), \
                patch.object(frames, "_download_limit_bytes", return_value=4), \
                patch.object(frames, "_download_video_for_frame", side_effect=download) as download_mock:
            results = self.run_jobs([self.job(index) for index in range(4)])
        self.assertEqual(download_mock.call_count, 1)
        self.assertTrue(all(not result["ok"] and "byte limit" in result["error"] for result in results))
        self.assertFalse(os.path.exists(os.path.join(self.input_root, "source.mp4")))

    def test_pending_cap_malformed_jobs_and_path_escapes(self):
        block = threading.Event()
        def blocked_extract(job):
            block.wait(1)
            raise RuntimeError("fixture release")
        jobs = [self.job(index) for index in range(17)]
        timer = threading.Timer(0.05, block.set)
        timer.start()
        self.addCleanup(timer.cancel)
        with patch.object(worker.SourceSession, "extract", side_effect=blocked_extract):
            results = self.run_jobs(jobs)
        rejected = [result for result in results if "16 pending" in result.get("error", "")]
        self.assertEqual(len(rejected), 1)
        self.assertEqual(rejected[0]["id"], "16")
        invalid = [{**self.job(20), "outputPath": os.path.join(self.temporary.name, "frame-abc-t20.png")},
                   {**self.job(21), "outputPath": os.path.join(self.output_root, "wrong-name.png")},
                   {**self.job(22), "timeSeconds": float("nan")},
                   {**self.job(23), "format": "svg"}, []]
        with patch.object(frames, "_pick_stream") as resolve:
            results = self.run_jobs(invalid)
        self.assertEqual(len(results), 5)
        self.assertTrue(all(not result["ok"] for result in results))
        resolve.assert_not_called()
        if hasattr(os, "symlink"):
            os.symlink(self.temporary.name, os.path.join(self.output_root, "escape"))
            results = self.run_jobs([{**self.job(24), "outputPath": os.path.join(self.output_root, "escape", "frame-abc-t24.png")}])
            self.assertIn("escaped", results[0]["error"])

    def test_protocol_input_and_output_are_bounded(self):
        output = io.StringIO()
        worker.run_worker(url="https://example.test/source", output_root=self.output_root,
                          input_root=self.input_root, timeout_s=75,
                          input_stream=io.StringIO("{invalid}\n" + "x" * 20_000 + "\n"), output_stream=output)
        lines = output.getvalue().splitlines()
        self.assertEqual(len(lines), 2)
        self.assertTrue(all(len(line.encode()) < 16_384 and not json.loads(line)["ok"] for line in lines))
        with patch.object(frames, "_pick_stream", side_effect=RuntimeError("\U0001f4a5" * 4000)):
            results = self.run_jobs([self.job(30)])
        self.assertLess(len(json.dumps(results[0])), 16_384)
        self.assertLessEqual(len(results[0]["error"].encode()), 2000)

    def test_single_frame_cli_keeps_its_contract_and_fractional_seeks(self):
        target = os.path.join(self.output_root, "frame-abc-t3_125.png")
        def extract(**args):
            self.assertEqual(args["pre_seek_s"], 1.125)
            self.assertEqual(args["accurate_offset_s"], 2)
            with open(args["output_path"], "wb") as file:
                file.write(b"single frame")
            return 0, "", ""
        with patch.object(frames, "_pick_stream", return_value=("https://example.test/stream", {})), \
                patch.object(frames, "_ffmpeg_cmd", return_value="fixture"), \
                patch.object(frames, "_run_ffmpeg_frame_extract", side_effect=extract), \
                patch("sys.stdout", new_callable=io.StringIO) as output:
            exit_code = frames.main(["--url", "https://example.test/source", "--time", "3.125",
                                     "--output", target, "--emit", "json"])
        result = json.loads(output.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(result["time_s"], 3.125)
        self.assertTrue(result["ok"])
        self.assertFalse(result["cached"])
        with patch.object(frames, "_pick_stream") as resolve:
            cached = frames._extract_frame(argparse.Namespace(url="https://example.test/source", time="3.125",
                                                              output=target, format="png", timeout_s=60))
        self.assertTrue(cached["cached"])
        resolve.assert_not_called()

    def test_download_monitor_stops_actual_overflow_and_bounds_diagnostics(self):
        source = os.path.join(self.input_root, "source.mp4")
        os.makedirs(self.input_root)
        script = "import pathlib,time; pathlib.Path(__import__('sys').argv[1]).write_bytes(b'x'*32); time.sleep(2)"
        started = time.monotonic()
        with self.assertRaisesRegex(RuntimeError, "byte limit"):
            frames._run_cmd([sys.executable, "-c", script, source], cwd=None, timeout_s=2,
                            output_limit_directory=self.input_root, max_output_bytes=8)
        self.assertLess(time.monotonic() - started, 1)
        code, stdout, stderr = frames._run_cmd([sys.executable, "-c", "import sys;print('x'*100000);sys.stderr.write('e'*100000)"],
                                              cwd=None, timeout_s=2)
        self.assertEqual(code, 0)
        self.assertEqual((len(stdout), len(stderr)), (65_536, 65_536))
        with self.assertRaises(subprocess.TimeoutExpired):
            frames._run_cmd([sys.executable, "-c", "import time;time.sleep(2)"], cwd=None, timeout_s=1)


if __name__ == "__main__":
    unittest.main()
