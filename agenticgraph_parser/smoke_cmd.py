import argparse
import os
import signal
import sys
from typing import Optional, Sequence

from . import markdown_cmd


class _Timeout(Exception):
    pass


def _raise_timeout(_signum: int, _frame: object) -> None:
    raise _Timeout()


def main(argv: Optional[Sequence[str]] = None, *, base_dir: str) -> int:
    parser = argparse.ArgumentParser(prog="smoke", add_help=True)
    parser.add_argument("--timeout-seconds", type=int, default=20)
    parser.add_argument(
        "--input",
        "-i",
        default=os.path.join(base_dir, "knowgrph_parser", "fixtures", "smoke.md"),
    )
    parser.add_argument(
        "--output-dir",
        "-o",
        default=os.path.join(base_dir, "data", "outputs", "_smoke"),
    )
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    timeout_seconds = int(arguments.timeout_seconds)
    input_path = os.path.abspath(str(arguments.input))
    output_dir = os.path.abspath(str(arguments.output_dir))
    os.makedirs(output_dir, exist_ok=True)

    prev_handler = signal.getsignal(signal.SIGALRM)
    signal.signal(signal.SIGALRM, _raise_timeout)
    signal.alarm(max(timeout_seconds, 1))
    try:
        code = markdown_cmd.main(["--input", input_path, "--output-dir", output_dir])
        if code != 0:
            raise SystemExit(code)
        return 0
    except _Timeout:
        print(f"Smoke run exceeded timeout ({timeout_seconds}s)", file=sys.stderr)
        return 2
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, prev_handler)

