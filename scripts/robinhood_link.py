#!/usr/bin/env python3
"""Link Robinhood locally with SMS/app approval and export a reusable session."""

from __future__ import annotations

import argparse
import base64
import json
import os
import pickle
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import robin_stocks.robinhood as robinhood
import robin_stocks.robinhood.authentication as robinhood_auth
from dotenv import load_dotenv, set_key

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
SESSION_FIELDS = (
    "access_token",
    "token_type",
    "refresh_token",
    "device_token",
)
SESSION_DAYS = 30

load_dotenv(ENV_PATH, override=False)


class LinkError(RuntimeError):
    """A safe, user-actionable linking failure."""


@contextmanager
def approval_deadline(seconds: int = 300) -> Iterator[None]:
    """Keep the private API's approval polling from hanging indefinitely."""
    if not hasattr(signal, "SIGALRM"):
        yield
        return

    def raise_timeout(_signum: int, _frame: Any) -> None:
        raise LinkError(
            "Robinhood approval timed out. Confirm the SMS/app prompt, wait a "
            "few minutes, and run this command again."
        )

    previous_handler = signal.signal(signal.SIGALRM, raise_timeout)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous_handler)


def encode_session(pickle_path: Path) -> str:
    """Convert robin_stocks' local pickle into portable, validated JSON."""
    try:
        # The pickle is trusted because this process just created its temp file.
        with pickle_path.open("rb") as session_file:
            stored = pickle.load(session_file)
    except (OSError, pickle.PickleError) as error:
        raise LinkError("Robinhood did not create a reusable session.") from error

    if not isinstance(stored, dict) or any(
        not isinstance(stored.get(field), str) or not stored[field]
        for field in SESSION_FIELDS
    ):
        raise LinkError("Robinhood returned an incomplete session.")

    payload = {
        "version": 1,
        **{field: stored[field] for field in SESSION_FIELDS},
    }
    return base64.b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")


def save_local_session(encoded: str) -> None:
    ENV_PATH.touch(mode=0o600, exist_ok=True)
    set_key(
        str(ENV_PATH),
        "ROBINHOOD_SESSION_B64",
        encoded,
        quote_mode="never",
    )
    ENV_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)


def publish_to_github(encoded: str) -> bool:
    """Send only the session—not the Robinhood password—to GitHub."""
    if not shutil.which("gh"):
        print(
            "GitHub CLI is unavailable; the session is safe in .env.local.",
            file=sys.stderr,
        )
        return False
    try:
        subprocess.run(
            ["gh", "secret", "set", "ROBINHOOD_SESSION_B64"],
            cwd=ROOT,
            input=encoded,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError:
        print(
            "GitHub publishing failed; the session is safe in .env.local.",
            file=sys.stderr,
        )
        return False
    print("GitHub Actions received the reusable Robinhood session.")
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--github",
        action="store_true",
        help="Publish ROBINHOOD_SESSION_B64 with the GitHub CLI.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    username = os.getenv("ROBINHOOD_USERNAME", "").strip()
    password = os.getenv("ROBINHOOD_PASSWORD", "").strip()
    if not username or not password:
        print(
            "Set ROBINHOOD_USERNAME and ROBINHOOD_PASSWORD in .env.local.",
            file=sys.stderr,
        )
        return 2

    print(
        "Starting Robinhood linking. Approve the device notification in the "
        "Robinhood app, or enter the SMS code when prompted."
    )
    try:
        with tempfile.TemporaryDirectory(
            prefix="free-finance-robinhood-"
        ) as directory:
            with approval_deadline():
                result = robinhood.login(
                    username,
                    password,
                    expiresIn=SESSION_DAYS * 24 * 60 * 60,
                    store_session=True,
                    pickle_path=directory,
                    pickle_name="-free-finance",
                )
            if not result:
                raise LinkError(
                    "Robinhood login failed. Check the credentials and approve "
                    "the newest phone challenge before trying again."
                )

            profile = robinhood.load_account_profile()
            if not profile:
                raise LinkError(
                    "Robinhood approved the login but did not return an account."
                )
            encoded = encode_session(
                Path(directory) / "robinhood-free-finance.pickle"
            )
    except (LinkError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        # Do not call logout(): it revokes the session needed by daily syncs.
        robinhood_auth.set_login_state(False)
        robinhood_auth.update_session("Authorization", None)

    save_local_session(encoded)
    print("Saved ROBINHOOD_SESSION_B64 to .env.local (mode 600).")
    if args.github:
        publish_to_github(encoded)
    print(
        "Robinhood is linked. If Robinhood later expires the session, run this "
        "helper again and approve a new login."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
