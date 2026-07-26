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
from plaid.exceptions import ApiException
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

if __package__:
    from .plaid_config import (
        encode_access_tokens,
        parse_access_tokens,
        parse_country_codes,
    )
else:
    from plaid_config import (
        encode_access_tokens,
        parse_access_tokens,
        parse_country_codes,
    )

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


def plaid_api_error_message(
    body: str | bytes | None,
    environment: str,
    status: int | None = None,
) -> str:
    """Turn Plaid's structured errors into safe, actionable CLI output."""
    if isinstance(body, bytes):
        body = body.decode(errors="replace")
    try:
        payload = json.loads(body or "{}")
    except (json.JSONDecodeError, TypeError):
        payload = {}

    code = payload.get("error_code")
    message = payload.get("error_message")
    request_id = payload.get("request_id")
    if code == "INVALID_API_KEYS":
        selected = environment.capitalize()
        other = "Sandbox" if environment == "production" else "Production"
        action = (
            "For real bank data, activate Plaid Trial and copy the Production "
            "secret into .env.local."
            if environment == "production"
            else "Copy the Sandbox secret into .env.local for test data."
        )
        return (
            f"Plaid rejected the API keys for {selected}. The secret may belong "
            f"to {other}, or access to {selected} is not active.\n"
            f"{action}\n"
            "Then verify PLAID_ENV matches that secret and re-run this command."
        )

    label = (
        f"Plaid request failed (HTTP {status})"
        if status
        else "Plaid request failed"
    )
    details = f"{code}: {message}" if code and message else (message or code)
    if details:
        label = f"{label}: {details}"
    if request_id:
        label = f"{label}\nPlaid request ID: {request_id}"
    return label


def report_plaid_api_error(error: ApiException, environment: str) -> int:
    print(
        plaid_api_error_message(
            getattr(error, "body", None),
            environment,
            getattr(error, "status", None),
        ),
        file=sys.stderr,
    )
    return 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--migrate",
        action="store_true",
        help=(
            "Convert an existing single-Item token to the multi-Item format "
            "without opening Link."
        ),
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Repair an existing Plaid Item in update mode.",
    )
    parser.add_argument(
        "--item-index",
        type=int,
        default=1,
        help="1-based Plaid Item to repair with --update (default: 1).",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Print the Hosted Link URL without opening a browser.",
    )
    parser.add_argument(
        "--github",
        action="store_true",
        help="Publish Plaid Item tokens and configuration with GitHub CLI.",
    )
    return parser.parse_args()


def save_plaid_config(
    access_tokens: tuple[str, ...],
    country_codes: tuple[str, ...],
) -> None:
    """Persist Item credentials and regions without printing their values."""
    if not ENV_PATH.exists():
        ENV_PATH.touch(mode=stat.S_IRUSR | stat.S_IWUSR)
    set_key(
        str(ENV_PATH),
        "PLAID_ACCESS_TOKENS",
        encode_access_tokens(access_tokens),
        quote_mode="always",
    )
    set_key(
        str(ENV_PATH),
        "PLAID_COUNTRY_CODES",
        ",".join(country_codes),
        quote_mode="never",
    )
    ENV_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)


def publish_to_github(
    client_id: str,
    secret: str,
    access_tokens: tuple[str, ...],
    environment: str,
    country_codes: tuple[str, ...],
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
            "PLAID_ACCESS_TOKENS": encode_access_tokens(access_tokens),
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
        subprocess.run(
            [
                "gh",
                "variable",
                "set",
                "PLAID_COUNTRY_CODES",
                "--body",
                ",".join(country_codes),
            ],
            cwd=ROOT,
            check=True,
        )
    except subprocess.CalledProcessError:
        print(
            "GitHub publishing failed; the token is safe in .env.local.",
            file=sys.stderr,
        )
        return False
    print(
        "GitHub Actions received the Plaid credentials, Items, environment, "
        "and country configuration."
    )
    return True


def main() -> int:
    args = parse_args()
    client_id = os.getenv("PLAID_CLIENT_ID", "").strip()
    secret = os.getenv("PLAID_SECRET", "").strip()
    environment = os.getenv("PLAID_ENV", "sandbox").strip().lower()
    try:
        access_tokens = parse_access_tokens(
            os.getenv("PLAID_ACCESS_TOKENS", ""),
            os.getenv("PLAID_ACCESS_TOKEN", ""),
        )
        country_codes = parse_country_codes(
            os.getenv("PLAID_COUNTRY_CODES", "US")
        )
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    if not client_id or not secret:
        print("Set PLAID_CLIENT_ID and PLAID_SECRET in .env.local.", file=sys.stderr)
        return 2
    if environment not in {"sandbox", "production"}:
        print("PLAID_ENV must be sandbox or production.", file=sys.stderr)
        return 2
    if args.item_index < 1:
        print("--item-index must be 1 or greater.", file=sys.stderr)
        return 2
    if args.migrate and args.update:
        print("--migrate and --update cannot be combined.", file=sys.stderr)
        return 2
    if not args.update and args.item_index != 1:
        print("--item-index is only used with --update.", file=sys.stderr)
        return 2
    if args.migrate and not access_tokens:
        print("--migrate requires an existing Plaid Item token.", file=sys.stderr)
        return 2
    if args.update and not access_tokens:
        print("--update requires an existing Plaid Item token.", file=sys.stderr)
        return 2
    if args.update and args.item_index > len(access_tokens):
        print(
            f"--item-index {args.item_index} exceeds the "
            f"{len(access_tokens)} configured Plaid Item(s).",
            file=sys.stderr,
        )
        return 2
    selected_access_token = (
        access_tokens[args.item_index - 1] if args.update else None
    )

    if args.migrate:
        save_plaid_config(access_tokens, country_codes)
        print(
            f"Migrated {len(access_tokens)} Plaid Item(s) to "
            "PLAID_ACCESS_TOKENS without printing their credentials."
        )
        if args.github and not publish_to_github(
            client_id,
            secret,
            access_tokens,
            environment,
            country_codes,
        ):
            return 1
        return 0

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
        "country_codes": [CountryCode(code) for code in country_codes],
        "user": LinkTokenCreateRequestUser(
            client_user_id="free-finance-owner"
        ),
        "hosted_link": LinkTokenCreateHostedLink(
            url_lifetime_seconds=1800
        ),
    }
    if args.update:
        request_values["access_token"] = selected_access_token
    else:
        request_values["products"] = [Products("transactions")]
        request_values["transactions"] = LinkTokenTransactions(
            days_requested=730
        )

    try:
        response = api.link_token_create(
            LinkTokenCreateRequest(**request_values)
        )
    except ApiException as error:
        return report_plaid_api_error(error, environment)
    hosted_url = response.hosted_link_url
    link_token = response.link_token
    if not hosted_url:
        print("Plaid did not return a Hosted Link URL.", file=sys.stderr)
        return 1

    print(
        "Open this private URL to connect a financial institution:"
        f"\n{hosted_url}"
    )
    if not args.no_browser:
        webbrowser.open(hosted_url)
    print("Waiting up to 30 minutes for Plaid Link to finish...")

    deadline = time.monotonic() + 30 * 60
    while time.monotonic() < deadline:
        try:
            status = api.link_token_get(
                LinkTokenGetRequest(link_token=link_token)
            )
        except ApiException as error:
            return report_plaid_api_error(error, environment)
        tokens = find_public_tokens(status)
        if tokens:
            next_access_tokens = list(access_tokens)
            for public_token in tokens:
                try:
                    exchange = api.item_public_token_exchange(
                        ItemPublicTokenExchangeRequest(
                            public_token=public_token
                        )
                    )
                except ApiException as error:
                    return report_plaid_api_error(error, environment)
                next_access_tokens.append(exchange.access_token)
            combined_tokens = tuple(dict.fromkeys(next_access_tokens))
            save_plaid_config(combined_tokens, country_codes)
            print(
                f"Connected {len(tokens)} Plaid Item(s). "
                f"{len(combined_tokens)} total Item(s) are saved in "
                ".env.local without printing their credentials."
            )
            if args.github and not publish_to_github(
                client_id,
                secret,
                combined_tokens,
                environment,
                country_codes,
            ):
                return 1
            print(
                "Next: run `.venv/bin/python scripts/sync.py --source plaid`. "
                "Linked Robinhood data will refresh in the same run."
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
                access_tokens,
                environment,
                country_codes,
            ):
                return 1
            return 0
        if session_exited(status):
            print(
                "Plaid Link exited before an institution was connected. "
                "Re-run this command when ready.",
                file=sys.stderr,
            )
            return 1
        time.sleep(3)

    print("Timed out waiting for Plaid Link. Re-run the command.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
