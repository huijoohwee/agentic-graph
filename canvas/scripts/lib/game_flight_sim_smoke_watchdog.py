"""Bound one real Flight verifier and clean up only its owned descendants."""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from typing import Any


def _processes() -> dict[int, tuple[int, str, str]]:
    result = subprocess.run(
        ["ps", "-axo", "pid=,ppid=,stat=,lstart=,comm="],
        check=True, capture_output=True, text=True, timeout=2,
    )
    records = {}
    for line in result.stdout.splitlines():
        parts = line.strip().split(maxsplit=8)
        if len(parts) == 9:
            records[int(parts[0])] = (int(parts[1]), " ".join(parts[3:]), parts[2])
    return records


def _capture_owned(pid: int, owned: dict[int, tuple[str, int]]) -> None:
    records = _processes()
    root = records.get(pid)
    if root is None or (pid in owned and owned[pid][0] != root[1]):
        return
    owned[pid] = (root[1], 0)
    frontier = [pid]
    visited = {pid}
    while frontier:
        parent = frontier.pop()
        for child, (ppid, identity, _) in records.items():
            if ppid == parent and child not in visited:
                owned[child] = (identity, owned[parent][1] + 1)
                visited.add(child)
                frontier.append(child)


def _signal_owned(owned: dict[int, tuple[str, int]], sig: int) -> None:
    # Birth identities were captured while ancestry led to our child. Recheck
    # them before every signal, including descendants reparented after TERM.
    records = _processes()
    root = next((pid for pid, (_, depth) in owned.items() if depth == 0), None)
    for pid, (identity, _) in sorted(owned.items(), key=lambda item: -item[1][1]):
        current = records.get(pid)
        if current is None or current[1] != identity or current[2].startswith("Z"):
            continue
        if sig == signal.SIGTERM and root in records:
            ancestor, visited = pid, set()
            while ancestor != root and ancestor in records and ancestor not in visited:
                visited.add(ancestor)
                ancestor = records[ancestor][0]
            if ancestor != root:
                continue
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass


def _alive_owned(owned: dict[int, tuple[str, int]]) -> list[int]:
    records = _processes()
    return [pid for pid, (identity, _) in owned.items()
            if pid in records and records[pid][1] == identity
            and not records[pid][2].startswith("Z")]


def _stop_owned(child: subprocess.Popen[Any], owned: dict[int, tuple[str, int]]) -> list[int]:
    _capture_owned(child.pid, owned)
    _signal_owned(owned, signal.SIGTERM)
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        child.poll()
        if not _alive_owned(owned):
            child.wait(timeout=2)
            return []
        time.sleep(0.05)
    _signal_owned(owned, signal.SIGKILL)
    try:
        child.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        survivors = _alive_owned(owned)
        if not survivors:
            return []
        time.sleep(0.05)
    return _alive_owned(owned)


def read_partial_evidence(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {"status": "not-configured"}
    try:
        if path.stat().st_size > 500_000:
            raise ValueError("partial evidence exceeds 500000 bytes")
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ValueError("partial evidence must be a JSON object")
        return {"status": "captured", "path": str(path), "value": value}
    except FileNotFoundError:
        return {"status": "missing", "path": str(path)}
    except (OSError, ValueError) as error:
        return {"status": "invalid", "path": str(path), "message": str(error)}


def supervise(command: list[str], timeout_seconds: float, partial_path: Path | None,
              startup_timeout_seconds: float | None = None) -> dict[str, Any]:
    if os.name != "posix":
        raise ValueError("Flight verifier watchdog requires POSIX process ownership")
    if not command or not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise ValueError("verifier command and finite positive timeout are required")
    if startup_timeout_seconds is not None and (
        not math.isfinite(startup_timeout_seconds) or startup_timeout_seconds <= 0
    ):
        raise ValueError("startup timeout must be finite and positive")
    if partial_path is not None:
        partial_path.unlink(missing_ok=True)
    child = subprocess.Popen(command, start_new_session=True)
    owned: dict[int, tuple[str, int]] = {}
    interrupted = []

    def handle_signal(number: int, _frame: Any) -> None:
        interrupted.append(number)

    previous = {number: signal.signal(number, handle_signal)
                for number in (signal.SIGTERM, signal.SIGINT)}
    status, exit_code = "exited", None
    survivors = []
    try:
        deadline = time.monotonic() + timeout_seconds
        startup_deadline = (time.monotonic() + startup_timeout_seconds
                            if partial_path is not None and startup_timeout_seconds is not None else None)
        _capture_owned(child.pid, owned)
        while child.poll() is None:
            if interrupted:
                status, exit_code = "interrupted", 128 + interrupted[0]
                break
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                status, exit_code = "timeout", 124
                break
            if startup_deadline is not None:
                if partial_path.is_file():
                    startup_deadline = None
                elif time.monotonic() >= startup_deadline:
                    status, exit_code = "startup-timeout", 124
                    break
            try:
                interval = min(1, remaining, max(0.001, startup_deadline - time.monotonic())
                               if startup_deadline is not None else 1)
                child.wait(timeout=interval)
            except subprocess.TimeoutExpired:
                _capture_owned(child.pid, owned)
        if exit_code is None:
            exit_code = child.returncode if child.returncode >= 0 else 128 - child.returncode
    finally:
        try:
            survivors = _stop_owned(child, owned)
        finally:
            for number, handler in previous.items():
                signal.signal(number, handler)
    report = {"schema": "flight-browser-verifier-supervision/v1", "status": status,
              "exitCode": exit_code, "timeoutSeconds": timeout_seconds,
              "startupTimeoutSeconds": startup_timeout_seconds,
              "verifierPid": child.pid, "ownedProcessCount": len(owned),
              "cleanupSurvivors": survivors}
    if status in {"timeout", "startup-timeout"}:
        report["partialEvidence"] = read_partial_evidence(partial_path)
    if survivors:
        report.update(status="cleanup-failed", exitCode=125)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout-seconds", type=float, required=True)
    parser.add_argument("--startup-timeout-seconds", type=float)
    parser.add_argument("--partial-evidence", type=Path)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    report = supervise(command, args.timeout_seconds, args.partial_evidence, args.startup_timeout_seconds)
    if report["exitCode"] != 0:
        print(json.dumps(report, allow_nan=False), file=sys.stderr, flush=True)
    raise SystemExit(report["exitCode"])


if __name__ == "__main__":
    main()
