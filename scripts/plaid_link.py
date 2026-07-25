#!/usr/bin/env python3
"""Create or repair a Plaid Item using Plaid-hosted Link."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import stat
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Any, Iterator

import plaid
from dotenv import load_dotenv, set_key
from plaid.api import plaid_api
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import (
    ItemPublicTokenExchangeRequest,
)
from plaid.model.link_token_create_hosted_link import (
    LinkTokenCreateHostedLink,
)
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import (
    LinkTokenCreateRequestUser,
)
from plaid.model.link_token_get_request import LinkTokenGetRequest
from plaid.model.link_token_transactions import LinkTokenTransactions
from plaid.model.products import Products

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
load_dotenv(ENV_PATH, override=False)


def values_named(value: Any, names: set[str]) -> Iterator[Any]:
    if hasattr(value, "to_dict"):
        value = value.to_dict()
    if isinstance(value, dict):
        for key, item in value.items():
            if key in names:
                yield item
            yield from values_named(item, names)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from values_named(item, names)


def find_public_tokens(response: Any) -> list[str]:
    tokens: list[str] = []
    for value in values_named(response, {"public_token", "public_tokens"}):
        candidates = value if isinstance(value, list) else [value]
        for token in candidates:
            if isinstance(token, str) and token.startswith("public-"):
                tokens.append(token)
    return list(dict.fromkeys(tokens))


def session_exited(response: Any) -> bool:
    statuses = {
        str(value).upper()
        for value in values_named(
            response, {"status", "link_session_status", "exit_status"}
        )
    }
    return bool(statuses & {"EXITED", "USER_EXITED", "ERROR"})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update",
        action="store_true",
        help="Repair the existing PLAID_ACCESS_TOKEN in update mode.",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Print the Hosted Link URL without opening a browser.",
    )
    parser.add_argument(
        "--github",
        action="store_true",
        help="Publish the access token and Plaid environment with GitHub CLI.",
    )
    return parser.parse_args()


def publish_to_github(
    client_id: str,
    secret: str,
    access_token: str,
    environment: str,
) -> bool:
    """Send secrets over stdin so credentials never enter shell history."""
    if not shutil.which("gh"):
        print(
            "GitHub CLI is unavailable; the token is safe in .env.local.",
            file=sys.stderr,
        )
        return False
    try:
        for name, value in {
            "PLAID_CLIENT_ID": client_id,
            "PLAID_SECRET": secret,
            "PLAID_ACCESS_TOKEN": access_token,
        }.items():
            subprocess.run(
                ["gh", "secret", "set", name],
                cwd=ROOT,
                input=value,
                text=True,
                check=True,
            )
        subprocess.run(
            ["gh", "variable", "set", "PLAID_ENV", "--body", environment],
            cwd=ROOT,
            check=True,
        )
    except subprocess.CalledProcessError:
        print(
            "GitHub publishing failed; the token is safe in .env.local.",
            file=sys.stderr,
        )
        return False
    print("GitHub Actions received the Plaid credentials and PLAID_ENV.")
    return True


def main() -> int:
    args = parse_args()
    client_id = os.getenv("PLAID_CLIENT_ID", "").strip()
    secret = os.getenv("PLAID_SECRET", "").strip()
    environment = os.getenv("PLAID_ENV", "sandbox").strip().lower()
    existing_access_token = os.getenv("PLAID_ACCESS_TOKEN", "").strip()
    if not client_id or not secret:
        print("Set PLAID_CLIENT_ID and PLAID_SECRET in .env.local.", file=sys.stderr)
        return 2
    if environment not in {"sandbox", "production"}:
        print("PLAID_ENV must be sandbox or production.", file=sys.stderr)
        return 2
    if args.update and not existing_access_token:
        print("--update requires an existing PLAID_ACCESS_TOKEN.", file=sys.stderr)
        return 2

    host = (
        plaid.Environment.Sandbox
        if environment == "sandbox"
        else plaid.Environment.Production
    )
    configuration = plaid.Configuration(
        host=host,
        api_key={"clientId": client_id, "secret": secret},
    )
    api = plaid_api.PlaidApi(plaid.ApiClient(configuration))

    request_values: dict[str, Any] = {
        "client_name": os.getenv("APP_NAME", "Free Finance"),
        "language": "en",
        "country_codes": [CountryCode("US")],
        "user": LinkTokenCreateRequestUser(
            client_user_id="free-finance-owner"
        ),
        "hosted_link": LinkTokenCreateHostedLink(
            url_lifetime_seconds=1800
        ),
    }
    if args.update:
        request_values["access_token"] = existing_access_token
    else:
        request_values["products"] = [Products("transactions")]
        request_values["transactions"] = LinkTokenTransactions(
            days_requested=730
        )

    response = api.link_token_create(
        LinkTokenCreateRequest(**request_values)
    )
    hosted_url = response.hosted_link_url
    link_token = response.link_token
    if not hosted_url:
        print("Plaid did not return a Hosted Link URL.", file=sys.stderr)
        return 1

    print(f"Open this private URL to connect your bank:\n{hosted_url}")
    if not args.no_browser:
        webbrowser.open(hosted_url)
    print("Waiting up to 30 minutes for Plaid Link to finish...")

    deadline = time.monotonic() + 30 * 60
    while time.monotonic() < deadline:
        status = api.link_token_get(
            LinkTokenGetRequest(link_token=link_token)
        )
        tokens = find_public_tokens(status)
        if tokens:
            exchange = api.item_public_token_exchange(
                ItemPublicTokenExchangeRequest(public_token=tokens[0])
            )
            if not ENV_PATH.exists():
                ENV_PATH.touch(mode=stat.S_IRUSR | stat.S_IWUSR)
            set_key(
                str(ENV_PATH),
                "PLAID_ACCESS_TOKEN",
                exchange.access_token,
                quote_mode="never",
            )
            ENV_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)
            print(
                "Bank connected. PLAID_ACCESS_TOKEN was saved to .env.local "
                "without printing it."
            )
            if args.github and not publish_to_github(
                client_id,
                secret,
                exchange.access_token,
                environment,
            ):
                return 1
            print(
                "Next: run `.venv/bin/python scripts/sync.py --source plaid`."
            )
            return 0
        if args.update and any(
            str(value).upper() == "SUCCESS"
            for value in values_named(status, {"status"})
        ):
            print(
                "Plaid update completed. The existing access token remains valid."
            )
            if args.github and not publish_to_github(
                client_id,
                secret,
                existing_access_token,
                environment,
            ):
                return 1
            return 0
        if session_exited(status):
            print(
                "Plaid Link exited before a bank was connected. Re-run this "
                "command when ready.",
                file=sys.stderr,
            )
            return 1
        time.sleep(3)

    print("Timed out waiting for Plaid Link. Re-run the command.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
