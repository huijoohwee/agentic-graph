from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any


VERIFICATION_CONTRACT_PATH = (
    Path(__file__).resolve().parents[1]
    / "contracts"
    / "game-flight-sim-browser-verifications.json"
)


def _read_required_verification_names() -> tuple[str, ...]:
    names = json.loads(VERIFICATION_CONTRACT_PATH.read_text(encoding="utf-8"))
    if (
        not isinstance(names, list)
        or not names
        or any(not isinstance(name, str) or not name.strip() for name in names)
        or len(set(names)) != len(names)
    ):
        raise ValueError(
            "Flight browser verification contract must contain unique "
            "non-empty names"
        )
    return tuple(names)


REQUIRED_BROWSER_VERIFICATION_NAMES = _read_required_verification_names()


class BrowserVerificationLedger:
    def __init__(self) -> None:
        self._records: dict[str, dict[str, Any]] = {}

    def verify(
        self,
        name: str,
        check: Callable[[], Any],
        *,
        depends_on: Iterable[str] = (),
    ) -> Any | None:
        if name in self._records:
            raise ValueError(f"duplicate browser verification name: {name}")
        dependencies = tuple(depends_on)
        unknown = [
            dependency
            for dependency in dependencies
            if dependency not in self._records
        ]
        if unknown:
            raise ValueError(
                f"{name} names unknown dependencies: {', '.join(unknown)}"
            )
        blocked = [
            dependency
            for dependency in dependencies
            if self._records[dependency]["status"] != "passed"
        ]
        if blocked:
            self._records[name] = {
                "name": name,
                "status": "skipped",
                "blockedBy": blocked,
            }
            return None
        try:
            value = check()
        except Exception as error:
            self._records[name] = {
                "name": name,
                "status": "failed",
                "errorType": type(error).__name__,
                "message": str(error),
            }
            return None
        self._records[name] = {"name": name, "status": "passed"}
        return value

    def evidence(self) -> list[dict[str, Any]]:
        return [dict(record) for record in self._records.values()]

    def assert_success(
        self,
        *,
        expected_names: Iterable[str] | None = None,
    ) -> None:
        failed = [
            record
            for record in self._records.values()
            if record["status"] == "failed"
        ]
        skipped = [
            record
            for record in self._records.values()
            if record["status"] == "skipped"
        ]
        expected = (
            tuple(expected_names)
            if expected_names is not None
            else None
        )
        actual = tuple(self._records)
        inventory_matches = expected is None or actual == expected
        if not failed and not skipped and inventory_matches:
            return
        lines = ["Flight browser named verifications did not all pass:"]
        if expected is not None and not inventory_matches:
            missing = [name for name in expected if name not in self._records]
            unexpected = [name for name in actual if name not in expected]
            lines.append(
                "INVENTORY mismatch: "
                f"expected={list(expected)}, actual={list(actual)}, "
                f"missing={missing}, unexpected={unexpected}"
            )
        lines.extend(
            f"FAILED {record['name']}: {record['message']}"
            for record in failed
        )
        lines.extend(
            f"SKIPPED {record['name']}: blocked by "
            f"{', '.join(record['blockedBy'])}"
            for record in skipped
        )
        raise AssertionError("\n".join(lines))
