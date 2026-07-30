from __future__ import annotations

from typing import Any


FLIGHT_THROTTLE_PROOF_TARGET = 0.75
FLIGHT_THROTTLE_PROOF_MESSAGE = (
    "Flight Sim throttle target set to 0.75."
)


def assert_staged_throttle_response(
    response: dict[str, Any],
    previous_throttle: float,
) -> dict[str, Any]:
    try:
        committed = response["flight"]["flightSim"]
        response_throttle = float(committed["aircraft"]["throttle"])
    except (KeyError, TypeError, ValueError) as error:
        raise AssertionError(
            f"Flight throttle response omitted its committed snapshot: {response}"
        ) from error
    if (
        response.get("ok") is not True
        or response.get("operation") != "throttle"
        or response.get("message") != FLIGHT_THROTTLE_PROOF_MESSAGE
        or committed.get("phase") not in ("ready", "flying")
        or committed.get("active") is not True
        or abs(response_throttle - previous_throttle) > 1e-6
        or abs(response_throttle - FLIGHT_THROTTLE_PROOF_TARGET) <= 1e-6
    ):
        raise AssertionError(
            "Flight throttle acknowledgement did not retain the committed "
            f"pre-tick snapshot: previous={previous_throttle}, response={response}"
        )
    return committed


def is_committed_throttle_target(
    snapshot: dict[str, Any],
    staged_snapshot: dict[str, Any],
) -> bool:
    try:
        return (
            snapshot.get("active") is True
            and snapshot.get("phase") == "flying"
            and snapshot.get("runId") == staged_snapshot.get("runId")
            and int(snapshot["tick"]) > int(staged_snapshot["tick"])
            and abs(
                float(snapshot["aircraft"]["throttle"])
                - FLIGHT_THROTTLE_PROOF_TARGET
            ) <= 1e-6
        )
    except (KeyError, TypeError, ValueError):
        return False
