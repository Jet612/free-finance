#!/usr/bin/env python3
"""Read-only provider sync for Free Finance.

Plaid and Robinhood are fetched independently. Database writes are idempotent,
and a provider cursor advances only after every corresponding write succeeds.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import logging
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Iterator, Sequence
from zoneinfo import ZoneInfo

import plaid
import robin_stocks.robinhood as robinhood
import robin_stocks.robinhood.authentication as robinhood_auth
from dotenv import load_dotenv
from plaid.api import plaid_api
from plaid.api_client import ApiClient
from plaid.exceptions import ApiException
from plaid.model.accounts_balance_get_request import AccountsBalanceGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.institutions_get_by_id_request import (
    InstitutionsGetByIdRequest,
)
from plaid.model.item_get_request import ItemGetRequest
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.transactions_sync_request_options import (
    TransactionsSyncRequestOptions,
)
from supabase import Client, create_client

if __package__:
    from .plaid_config import (
        parse_access_tokens,
        parse_country_codes,
    )
else:
    from plaid_config import (
        parse_access_tokens,
        parse_country_codes,
    )

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local", override=False)

LOGGER = logging.getLogger("free-finance-sync")
UTC = timezone.utc
TABLE_BATCH_SIZE = 400
ROBINHOOD_SESSION_FIELDS = (
    "access_token",
    "token_type",
    "refresh_token",
    "device_token",
)
ROBINHOOD_ACCOUNTS_URL = "https://api.robinhood.com/accounts/"
ROBINHOOD_POSITIONS_URL = "https://api.robinhood.com/positions/"


class SyncError(RuntimeError):
    """A user-actionable provider or configuration failure."""


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_secret_key: str
    plaid_environment: str
    plaid_client_id: str
    plaid_secret: str
    plaid_access_tokens: tuple[str, ...]
    plaid_country_codes: tuple[str, ...]
    robinhood_session_b64: str

    @classmethod
    def from_environment(cls) -> "Settings":
        try:
            access_tokens = parse_access_tokens(
                os.getenv("PLAID_ACCESS_TOKENS", ""),
                os.getenv("PLAID_ACCESS_TOKEN", ""),
            )
            country_codes = parse_country_codes(
                os.getenv("PLAID_COUNTRY_CODES", "US")
            )
        except ValueError as error:
            raise SyncError(str(error)) from error
        return cls(
            supabase_url=os.getenv("SUPABASE_URL", "").strip(),
            supabase_secret_key=os.getenv("SUPABASE_SECRET_KEY", "").strip(),
            plaid_environment=os.getenv("PLAID_ENV", "sandbox").strip().lower(),
            plaid_client_id=os.getenv("PLAID_CLIENT_ID", "").strip(),
            plaid_secret=os.getenv("PLAID_SECRET", "").strip(),
            plaid_access_tokens=access_tokens,
            plaid_country_codes=country_codes,
            robinhood_session_b64=os.getenv(
                "ROBINHOOD_SESSION_B64", ""
            ).strip(),
        )

    @property
    def plaid_configured(self) -> bool:
        return all(
            (self.plaid_client_id, self.plaid_secret, self.plaid_access_tokens)
        )

    @property
    def robinhood_configured(self) -> bool:
        return bool(self.robinhood_session_b64)

    def validate_database(self) -> None:
        if not self.supabase_url or not self.supabase_secret_key:
            raise SyncError(
                "SUPABASE_URL and SUPABASE_SECRET_KEY must both be configured."
            )

    def validate_plaid(self) -> None:
        if not self.plaid_configured:
            raise SyncError(
                "Plaid is incomplete. Set PLAID_CLIENT_ID, PLAID_SECRET, and "
                "PLAID_ACCESS_TOKENS."
            )
        if self.plaid_environment not in {"sandbox", "production"}:
            raise SyncError("PLAID_ENV must be either sandbox or production.")

    def validate_robinhood(self) -> None:
        if not self.robinhood_configured:
            raise SyncError(
                "Robinhood sync is not linked. Run "
                "`python scripts/robinhood_link.py --github` locally."
            )

    @property
    def secrets(self) -> tuple[str, ...]:
        return tuple(
            value
            for value in (
                self.supabase_secret_key,
                self.plaid_client_id,
                self.plaid_secret,
                *self.plaid_access_tokens,
                self.robinhood_session_b64,
            )
            if value
        )


def redact(value: object, settings: Settings) -> str:
    text = str(value)
    for secret in settings.secrets:
        text = text.replace(secret, "[REDACTED]")
    return text


def chunks(values: Sequence[Any], size: int = TABLE_BATCH_SIZE) -> Iterator[list[Any]]:
    for start in range(0, len(values), size):
        yield list(values[start : start + size])


def utc_now() -> datetime:
    return datetime.now(UTC)


def iso_now() -> str:
    return utc_now().isoformat()


def today_string() -> str:
    timezone_name = os.getenv("APP_TIMEZONE", "America/New_York")
    try:
        return str(datetime.now(ZoneInfo(timezone_name)).date())
    except Exception:
        LOGGER.warning("Invalid APP_TIMEZONE; using UTC for snapshot date.")
        return str(utc_now().date())


def decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value in (None, ""):
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return default


def decimal_string(value: Any) -> str:
    return format(decimal(value), "f")


def value_of(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    return value


def get_value(source: Any, key: str, default: Any = None) -> Any:
    if isinstance(source, dict):
        return source.get(key, default)
    return getattr(source, key, default)


def jsonable(value: Any) -> Any:
    """Convert SDK model objects to values PostgREST can JSON encode."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(item) for item in value]
    if hasattr(value, "to_dict"):
        return jsonable(value.to_dict())
    return str(value)


class SyncStore:
    def __init__(self, client: Client, dry_run: bool = False) -> None:
        self.client = client
        self.dry_run = dry_run

    def get_cursor(self, source: str) -> str | None:
        result = (
            self.client.table("sync_states")
            .select("cursor")
            .eq("source", source)
            .maybe_single()
            .execute()
        )
        data = result.data
        return data.get("cursor") if isinstance(data, dict) else None

    def upsert(
        self, table: str, rows: Sequence[dict[str, Any]], on_conflict: str
    ) -> list[dict[str, Any]]:
        if not rows:
            return []
        if self.dry_run:
            return list(rows)

        returned: list[dict[str, Any]] = []
        for batch in chunks(rows):
            result = (
                self.client.table(table)
                .upsert(batch, on_conflict=on_conflict)
                .execute()
            )
            if isinstance(result.data, list):
                returned.extend(result.data)
        return returned

    def delete_external_ids(self, table: str, external_ids: Sequence[str]) -> int:
        if not external_ids or self.dry_run:
            return 0
        deleted = 0
        for batch in chunks(external_ids):
            result = (
                self.client.table(table)
                .delete()
                .in_("external_id", batch)
                .execute()
            )
            if isinstance(result.data, list):
                deleted += len(result.data)
        return deleted

    def existing_holding_ids(self, account_id: int) -> set[str]:
        result = (
            self.client.table("holdings")
            .select("external_id")
            .eq("account_id", account_id)
            .execute()
        )
        return {
            str(row["external_id"])
            for row in (result.data or [])
            if row.get("external_id")
        }

    def delete_holding_external_ids(
        self, account_id: int, external_ids: Sequence[str]
    ) -> int:
        """Delete stale holdings without touching the same symbol elsewhere."""
        if not external_ids or self.dry_run:
            return 0
        deleted = 0
        for batch in chunks(external_ids):
            result = (
                self.client.table("holdings")
                .delete()
                .eq("account_id", account_id)
                .in_("external_id", batch)
                .execute()
            )
            if isinstance(result.data, list):
                deleted += len(result.data)
        return deleted

    def begin(self, source: str) -> int | None:
        if self.dry_run:
            return None
        now = iso_now()
        self.upsert(
            "sync_states",
            [
                {
                    "source": source,
                    "status": "running",
                    "last_attempt_at": now,
                    "last_error": None,
                    "updated_at": now,
                }
            ],
            "source",
        )
        result = (
            self.client.table("sync_runs")
            .insert({"source": source, "status": "running"})
            .execute()
        )
        if result.data:
            return int(result.data[0]["id"])
        return None

    def succeed(
        self,
        source: str,
        run_id: int | None,
        counts: dict[str, int],
        *,
        cursor: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        if self.dry_run:
            return
        now = iso_now()
        state: dict[str, Any] = {
            "source": source,
            "status": "success",
            "last_attempt_at": now,
            "last_success_at": now,
            "last_error": None,
            "details": details or {},
            "updated_at": now,
        }
        if cursor is not None:
            state["cursor"] = cursor
        self.upsert("sync_states", [state], "source")
        if run_id is not None:
            (
                self.client.table("sync_runs")
                .update(
                    {
                        "status": "success",
                        "finished_at": now,
                        "counts": counts,
                        "error_message": None,
                    }
                )
                .eq("id", run_id)
                .execute()
            )

    def fail(
        self, source: str, run_id: int | None, message: str
    ) -> None:
        if self.dry_run:
            return
        now = iso_now()
        # Error text is intentionally bounded before persistence.
        safe_message = message[:1000]
        self.upsert(
            "sync_states",
            [
                {
                    "source": source,
                    "status": "failed",
                    "last_attempt_at": now,
                    "last_error": safe_message,
                    "updated_at": now,
                }
            ],
            "source",
        )
        if run_id is not None:
            (
                self.client.table("sync_runs")
                .update(
                    {
                        "status": "failed",
                        "finished_at": now,
                        "error_message": safe_message,
                    }
                )
                .eq("id", run_id)
                .execute()
            )


def plaid_client(settings: Settings) -> tuple[plaid_api.PlaidApi, ApiClient]:
    host = (
        plaid.Environment.Sandbox
        if settings.plaid_environment == "sandbox"
        else plaid.Environment.Production
    )
    configuration = plaid.Configuration(
        host=host,
        api_key={
            "clientId": settings.plaid_client_id,
            "secret": settings.plaid_secret,
        },
    )
    api_client = plaid.ApiClient(configuration)
    return plaid_api.PlaidApi(api_client), api_client


def plaid_error_code(error: ApiException) -> str | None:
    try:
        body = json.loads(error.body or "{}")
        return body.get("error_code")
    except (TypeError, json.JSONDecodeError):
        return None


def fetch_plaid_institution_name(
    client: plaid_api.PlaidApi,
    access_token: str,
    country_codes: tuple[str, ...],
    fallback: str = "Plaid",
) -> tuple[str, dict[str, Any]]:
    item_response = client.item_get(
        ItemGetRequest(access_token=access_token)
    )
    item = item_response.item
    institution_id = item.institution_id
    metadata = {
        "item_id": item.item_id,
        "institution_id": institution_id,
    }
    if not institution_id:
        return fallback, metadata
    try:
        response = client.institutions_get_by_id(
            InstitutionsGetByIdRequest(
                institution_id=institution_id,
                country_codes=[
                    CountryCode(code) for code in country_codes
                ],
            )
        )
        return response.institution.name or fallback, metadata
    except Exception as error:  # Institution labels should not block balances.
        LOGGER.warning("Institution lookup failed: %s", type(error).__name__)
        return fallback, metadata


def parse_plaid_cursor_state(
    value: str | None,
    item_ids: Sequence[str],
) -> dict[str, str]:
    """Read per-Item cursors while accepting the original single cursor."""
    if not value:
        return {}
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        # Before multi-Item support, `cursor` held Plaid's opaque cursor directly.
        return {item_ids[0]: value} if item_ids else {}
    if not isinstance(payload, dict) or payload.get("version") != 1:
        return {item_ids[0]: value} if item_ids else {}
    items = payload.get("items")
    if not isinstance(items, dict):
        return {item_ids[0]: value} if item_ids else {}
    return {
        str(item_id): str(cursor)
        for item_id, cursor in items.items()
        if isinstance(item_id, str)
        and item_id
        and isinstance(cursor, str)
        and cursor
    }


def encode_plaid_cursor_state(cursors: dict[str, str]) -> str:
    return json.dumps(
        {"version": 1, "items": cursors},
        separators=(",", ":"),
        sort_keys=True,
    )


def fetch_plaid_transaction_changes(
    client: plaid_api.PlaidApi,
    access_token: str,
    starting_cursor: str | None,
) -> tuple[list[Any], list[Any], list[Any], str]:
    """Fetch a complete cursor page set before writing any part of it."""
    for attempt in range(2):
        cursor = starting_cursor
        added: list[Any] = []
        modified: list[Any] = []
        removed: list[Any] = []
        try:
            while True:
                request_values: dict[str, Any] = {
                    "access_token": access_token,
                    "count": 500,
                    "options": TransactionsSyncRequestOptions(
                        include_original_description=True
                    ),
                }
                if cursor:
                    request_values["cursor"] = cursor
                response = client.transactions_sync(
                    TransactionsSyncRequest(**request_values)
                )
                added.extend(response.added)
                modified.extend(response.modified)
                removed.extend(response.removed)
                cursor = response.next_cursor
                if not response.has_more:
                    return added, modified, removed, cursor
        except ApiException as error:
            if (
                plaid_error_code(error)
                == "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"
                and attempt == 0
            ):
                LOGGER.warning(
                    "Plaid changed transactions during pagination; restarting."
                )
                continue
            raise
    raise SyncError("Plaid transaction pagination could not stabilize.")


def plaid_account_row(
    account: Any,
    institution_name: str,
    item_metadata: dict[str, Any],
    synced_at: str,
) -> dict[str, Any]:
    account_type = str(value_of(account.type))
    multiplier = Decimal("-1") if account_type in {"credit", "loan"} else Decimal("1")
    current = decimal(account.balances.current) * multiplier
    available = account.balances.available
    return {
        "source": "plaid",
        "external_id": account.account_id,
        "institution_name": institution_name,
        "name": account.name,
        "official_name": account.official_name,
        "account_type": account_type,
        "account_subtype": str(value_of(account.subtype)) if account.subtype else None,
        "mask": account.mask,
        "currency_code": (
            account.balances.iso_currency_code
            or account.balances.unofficial_currency_code
            or "USD"
        ),
        "current_balance": decimal_string(current),
        "available_balance": (
            decimal_string(available) if available is not None else None
        ),
        "connected": True,
        "last_synced_at": synced_at,
        "metadata": item_metadata,
        "updated_at": synced_at,
    }


def plaid_transaction_row(transaction: Any, account_id: int) -> dict[str, Any]:
    category = get_value(transaction, "personal_finance_category")
    # Not every institution returns a timestamp. Plaid recommends the
    # authorization time for user-facing activity because it is closest to
    # when the purchase happened; date-only records stay null.
    transaction_at = get_value(transaction, "authorized_datetime") or get_value(
        transaction, "datetime"
    )
    return {
        "account_id": account_id,
        "external_id": transaction.transaction_id,
        "transaction_date": str(transaction.date),
        "authorized_date": (
            str(transaction.authorized_date)
            if transaction.authorized_date
            else None
        ),
        "transaction_at": str(transaction_at) if transaction_at else None,
        "name": transaction.name,
        "merchant_name": transaction.merchant_name,
        # Plaid's positive amount is an outflow; the app uses positive cash-in.
        "amount": decimal_string(-decimal(transaction.amount)),
        "category_primary": (
            str(value_of(get_value(category, "primary"))) if category else None
        ),
        "category_detailed": (
            str(value_of(get_value(category, "detailed"))) if category else None
        ),
        "pending": bool(transaction.pending),
        "payment_channel": (
            str(value_of(transaction.payment_channel))
            if transaction.payment_channel
            else None
        ),
        "currency_code": (
            transaction.iso_currency_code
            or transaction.unofficial_currency_code
            or "USD"
        ),
        "logo_url": get_value(transaction, "logo_url"),
        "website": get_value(transaction, "website"),
        "raw_data": jsonable(transaction),
        "updated_at": iso_now(),
    }


def sync_plaid_item(
    store: SyncStore,
    client: plaid_api.PlaidApi,
    access_token: str,
    institution_name: str,
    item_metadata: dict[str, Any],
    starting_cursor: str | None,
) -> tuple[dict[str, int], str]:
    synced_at = iso_now()
    balance_response = client.accounts_balance_get(
        AccountsBalanceGetRequest(access_token=access_token)
    )
    account_rows = [
        plaid_account_row(account, institution_name, item_metadata, synced_at)
        for account in balance_response.accounts
    ]

    if store.dry_run:
        account_ids = {
            row["external_id"]: index + 1 for index, row in enumerate(account_rows)
        }
    else:
        persisted = store.upsert(
            "accounts", account_rows, "source,external_id"
        )
        account_ids = {
            str(row["external_id"]): int(row["id"]) for row in persisted
        }
    if len(account_ids) != len(account_rows):
        raise SyncError("Supabase did not return every Plaid account after upsert.")

    snapshot_date = today_string()
    snapshot_rows = [
        {
            "account_id": account_ids[row["external_id"]],
            "snapshot_date": snapshot_date,
            "balance": row["current_balance"],
            "available_balance": row["available_balance"],
        }
        for row in account_rows
    ]

    added, modified, removed, next_cursor = fetch_plaid_transaction_changes(
        client, access_token, starting_cursor
    )
    changed = [*added, *modified]
    transaction_rows = [
        plaid_transaction_row(
            transaction, account_ids[transaction.account_id]
        )
        for transaction in changed
        if transaction.account_id in account_ids
    ]
    removed_ids = [
        str(get_value(transaction, "transaction_id"))
        for transaction in removed
        if get_value(transaction, "transaction_id")
    ]

    if not store.dry_run:
        store.upsert(
            "balance_snapshots",
            snapshot_rows,
            "account_id,snapshot_date",
        )
        store.upsert("transactions", transaction_rows, "external_id")
        deleted = store.delete_external_ids("transactions", removed_ids)
    else:
        deleted = len(removed_ids)

    counts = {
        "accounts": len(account_rows),
        "snapshots": len(snapshot_rows),
        "transactions_added": len(added),
        "transactions_modified": len(modified),
        "transactions_removed": deleted,
    }
    return counts, next_cursor


def sync_plaid(
    settings: Settings, store: SyncStore
) -> tuple[dict[str, int], str, dict[str, Any]]:
    settings.validate_plaid()
    client, _api_client = plaid_client(settings)
    items: list[tuple[str, str, dict[str, Any]]] = []
    for index, access_token in enumerate(
        settings.plaid_access_tokens,
        start=1,
    ):
        try:
            institution_name, item_metadata = fetch_plaid_institution_name(
                client,
                access_token,
                settings.plaid_country_codes,
            )
        except Exception as error:
            raise SyncError(
                f"Plaid Item {index} could not be read: {error}"
            ) from error
        item_id = str(item_metadata.get("item_id") or "")
        if not item_id:
            raise SyncError(f"Plaid Item {index} did not return an Item ID.")
        items.append((access_token, institution_name, item_metadata))

    item_ids = [str(metadata["item_id"]) for _, _, metadata in items]
    cursor_state = parse_plaid_cursor_state(
        store.get_cursor("plaid"),
        item_ids,
    )
    next_cursor_state = dict(cursor_state)
    totals: dict[str, int] = {}
    institutions: list[str] = []

    for index, (
        access_token,
        institution_name,
        item_metadata,
    ) in enumerate(items, start=1):
        item_id = str(item_metadata["item_id"])
        try:
            counts, next_cursor = sync_plaid_item(
                store,
                client,
                access_token,
                institution_name,
                item_metadata,
                cursor_state.get(item_id),
            )
        except Exception as error:
            raise SyncError(
                f"Plaid Item {index} ({institution_name}) failed: {error}"
            ) from error
        for label, count in counts.items():
            totals[label] = totals.get(label, 0) + count
        next_cursor_state[item_id] = next_cursor
        institutions.append(institution_name)

    unique_institutions = list(dict.fromkeys(institutions))
    return totals, encode_plaid_cursor_state(next_cursor_state), {
        "institution": (
            unique_institutions[0]
            if len(unique_institutions) == 1
            else f"{len(unique_institutions)} institutions"
        ),
        "institutions": unique_institutions,
        "items": len(items),
        "countries": list(settings.plaid_country_codes),
        "environment": settings.plaid_environment,
    }


def decode_robinhood_session(encoded: str) -> dict[str, str]:
    """Decode the trusted session exported by the local linking helper."""
    try:
        raw = base64.b64decode(encoded, validate=True)
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SyncError(
            "ROBINHOOD_SESSION_B64 is invalid. Re-run "
            "`python scripts/robinhood_link.py --github` locally."
        ) from error

    if not isinstance(payload, dict) or payload.get("version") != 1:
        raise SyncError("The Robinhood session has an unsupported format.")
    if any(
        not isinstance(payload.get(field), str) or not payload[field]
        for field in ROBINHOOD_SESSION_FIELDS
    ):
        raise SyncError("The Robinhood session is missing required credentials.")
    return {field: payload[field] for field in ROBINHOOD_SESSION_FIELDS}


def activate_robinhood_session(encoded: str) -> None:
    """Install a cached bearer token without starting an interactive login."""
    session = decode_robinhood_session(encoded)
    robinhood_auth.update_session(
        "Authorization",
        f"{session['token_type']} {session['access_token']}",
    )
    robinhood_auth.set_login_state(True)


def clear_robinhood_session() -> None:
    """Clear process memory without revoking the reusable server session."""
    robinhood_auth.set_login_state(False)
    robinhood_auth.update_session("Authorization", None)


def fetch_robinhood_accounts() -> list[dict[str, Any]]:
    """Return every brokerage account, including Strategies accounts."""
    profiles = robinhood.request_get(
        ROBINHOOD_ACCOUNTS_URL,
        "pagination",
        {
            "default_to_all_accounts": "true",
            "include_managed": "true",
            "include_multiple_individual": "true",
        },
    )
    if profiles in (None, [None]):
        raise SyncError("Robinhood accounts were unavailable.")
    return [profile for profile in profiles if isinstance(profile, dict)]


def fetch_robinhood_positions(account_number: str) -> list[dict[str, Any]]:
    positions = robinhood.request_get(
        ROBINHOOD_POSITIONS_URL,
        "pagination",
        {
            "account_number": account_number,
            "include_managed": "true",
            "nonzero": "true",
        },
    )
    if positions in (None, [None]):
        raise SyncError(
            f"Robinhood positions were unavailable for account "
            f"ending {account_number[-4:]}."
        )
    return [position for position in positions if isinstance(position, dict)]


def robinhood_account_number(profile: dict[str, Any]) -> str:
    account_number = str(
        profile.get("account_number")
        or profile.get("rhs_account_number")
        or ""
    )
    if not account_number:
        raise SyncError("Robinhood returned an account without an identifier.")
    return account_number


def robinhood_account_labels(
    profile: dict[str, Any],
) -> tuple[str, str, str]:
    brokerage_type = str(
        profile.get("brokerage_account_type") or "individual"
    ).lower()
    type_labels = {
        "individual": "Individual",
        "ira_roth": "Roth IRA",
        "ira_traditional": "Traditional IRA",
        "ira_sep": "SEP IRA",
        "ira_simple": "SIMPLE IRA",
        "joint_tenancy_with_ros": "Joint",
        "joint_community_property": "Joint Community Property",
        "custodial_ugma": "Custodial UGMA",
        "custodial_utma": "Custodial UTMA",
        "trust_revocable": "Revocable Trust",
        "trust_irrevocable": "Irrevocable Trust",
    }
    type_label = type_labels.get(
        brokerage_type,
        brokerage_type.replace("_", " ").title(),
    )
    nickname = str(profile.get("nickname") or "").strip()
    is_managed = profile.get("management_type") == "managed"
    if is_managed:
        name = nickname or f"Managed {type_label}"
        return name, f"Robinhood Strategies {name}", "managed"
    if brokerage_type == "individual":
        return nickname or "Brokerage", "Robinhood Brokerage", "brokerage"
    name = nickname or type_label
    return name, f"Robinhood {name}", brokerage_type.replace("_", " ")


def robinhood_stock_rows(
    positions: list[dict[str, Any]], account_id: int, synced_at: str
) -> list[dict[str, Any]]:
    enriched: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for position in positions:
        quantity = decimal(position.get("quantity"))
        if quantity <= 0:
            continue
        instrument_url = str(position.get("instrument") or "")
        instrument = robinhood.get_instrument_by_url(instrument_url)
        if not isinstance(instrument, dict) or not instrument.get("symbol"):
            raise SyncError(
                "Robinhood did not return instrument details for an open "
                "position; existing holdings were preserved."
            )
        enriched.append((position, instrument))

    symbols = [str(instrument["symbol"]).upper() for _, instrument in enriched]
    quotes = robinhood.get_quotes(symbols) if symbols else []
    if quotes in (None, [None]):
        raise SyncError(
            "Robinhood quotes were unavailable; existing holdings were "
            "preserved."
        )
    quote_by_symbol = {
        str(quote.get("symbol") or "").upper(): quote
        for quote in quotes
        if isinstance(quote, dict) and quote.get("symbol")
    }

    rows: list[dict[str, Any]] = []
    for position, instrument in enriched:
        symbol = str(instrument["symbol"]).upper()
        quote = quote_by_symbol.get(symbol)
        if not quote:
            raise SyncError(
                f"Robinhood did not return a current quote for {symbol}; "
                "existing holdings were preserved."
            )
        quantity = decimal(position.get("quantity"))
        average_cost = decimal(position.get("average_buy_price"))
        current_price = decimal(
            quote.get("last_extended_hours_trade_price")
            or quote.get("last_trade_price")
        )
        if current_price <= 0:
            raise SyncError(
                f"Robinhood returned an invalid current quote for {symbol}; "
                "existing holdings were preserved."
            )
        current_value = quantity * current_price
        cost_basis = quantity * average_cost
        gain = current_value - cost_basis
        gain_percent = (
            (gain / cost_basis) * Decimal("100")
            if cost_basis
            else Decimal("0")
        )
        holding_external_id = (
            instrument.get("id") or position.get("id") or symbol
        )
        rows.append(
            {
                "account_id": account_id,
                "external_id": f"stock:{holding_external_id}",
                "symbol": symbol.upper(),
                "name": (
                    instrument.get("simple_name")
                    or instrument.get("name")
                    or symbol
                ),
                "asset_type": instrument.get("type") or "stock",
                "quantity": decimal_string(quantity),
                "average_cost": decimal_string(average_cost),
                "current_price": decimal_string(current_price),
                "current_value": decimal_string(current_value),
                "cost_basis": decimal_string(cost_basis),
                "unrealized_gain": decimal_string(gain),
                "unrealized_gain_percent": decimal_string(gain_percent),
                "raw_data": jsonable(
                    {
                        "position": position,
                        "instrument": instrument,
                        "quote": quote,
                    }
                ),
                "synced_at": synced_at,
                "updated_at": synced_at,
            }
        )
    return rows


def robinhood_crypto_rows(
    positions: list[dict[str, Any]], account_id: int, synced_at: str
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for position in positions:
        quantity = decimal(position.get("quantity"))
        if quantity <= 0:
            continue
        currency = position.get("currency") or {}
        symbol = str(
            get_value(currency, "code")
            or get_value(currency, "symbol")
            or "CRYPTO"
        ).upper()
        quote = robinhood.get_crypto_quote(symbol) or {}
        current_price = decimal(
            quote.get("mark_price") or quote.get("ask_price")
        )
        current_value = quantity * current_price
        cost_basis_value = position.get("cost_basis")
        if isinstance(cost_basis_value, dict):
            cost_basis_value = (
                cost_basis_value.get("direct_cost_basis")
                or cost_basis_value.get("cost_basis")
            )
        cost_basis = decimal(cost_basis_value)
        average_cost = cost_basis / quantity if quantity else Decimal("0")
        gain = current_value - cost_basis
        gain_percent = (
            (gain / cost_basis) * Decimal("100")
            if cost_basis
            else Decimal("0")
        )
        rows.append(
            {
                "account_id": account_id,
                "external_id": f"crypto:{position.get('id') or symbol}",
                "symbol": symbol,
                "name": get_value(currency, "name") or symbol,
                "asset_type": "crypto",
                "quantity": decimal_string(quantity),
                "average_cost": decimal_string(average_cost),
                "current_price": decimal_string(current_price),
                "current_value": decimal_string(current_value),
                "cost_basis": decimal_string(cost_basis),
                "unrealized_gain": decimal_string(gain),
                "unrealized_gain_percent": decimal_string(gain_percent),
                "raw_data": jsonable(position),
                "synced_at": synced_at,
                "updated_at": synced_at,
            }
        )
    return rows


def sync_robinhood(
    settings: Settings, store: SyncStore
) -> tuple[dict[str, int], dict[str, Any]]:
    settings.validate_robinhood()
    synced_at = iso_now()
    try:
        # Interactive SMS/app approval happens only in robinhood_link.py.
        activate_robinhood_session(settings.robinhood_session_b64)
        account_profiles = fetch_robinhood_accounts()
        if not account_profiles:
            raise SyncError(
                "The Robinhood session expired or was revoked. Re-run "
                "`python scripts/robinhood_link.py --github` locally and "
                "approve the new login."
            )

        crypto_positions = robinhood.get_crypto_positions()
        if crypto_positions is None:
            raise SyncError(
                "Robinhood crypto positions were unavailable; existing "
                "holdings were preserved."
            )
        crypto_profile = (
            robinhood.load_crypto_profile() if crypto_positions else {}
        ) or {}

        crypto_preview = robinhood_crypto_rows(
            list(crypto_positions), 0, synced_at
        )
        crypto_value = sum(
            (decimal(row["current_value"]) for row in crypto_preview),
            Decimal("0"),
        )

        crypto_account_number = str(
            crypto_profile.get("rhs_account_number")
            or crypto_profile.get("apex_account_number")
            or ""
        )
        crypto_target_number = ""
        for profile in account_profiles:
            profile_numbers = {
                str(profile.get("account_number") or ""),
                str(profile.get("rhs_account_number") or ""),
            }
            if crypto_account_number and crypto_account_number in profile_numbers:
                crypto_target_number = robinhood_account_number(profile)
                break
        if crypto_positions and not crypto_target_number:
            self_directed = next(
                (
                    profile
                    for profile in account_profiles
                    if profile.get("management_type") != "managed"
                ),
                None,
            )
            if not self_directed:
                raise SyncError(
                    "Robinhood crypto could not be matched to a brokerage "
                    "account; existing holdings were preserved."
                )
            crypto_target_number = robinhood_account_number(self_directed)

        prepared: list[dict[str, Any]] = []
        for placeholder_id, account_profile in enumerate(
            account_profiles,
            start=1,
        ):
            account_number = robinhood_account_number(account_profile)
            portfolio = robinhood.load_portfolio_profile(
                account_number=account_number
            )
            if not isinstance(portfolio, dict):
                raise SyncError(
                    f"Robinhood portfolio data was unavailable for account "
                    f"ending {account_number[-4:]}."
                )
            positions = fetch_robinhood_positions(account_number)
            stock_market_value = decimal(portfolio.get("market_value"))
            if stock_market_value > Decimal("0.01") and not positions:
                raise SyncError(
                    f"Robinhood reported invested value for account ending "
                    f"{account_number[-4:]} but returned no stock positions; "
                    "existing holdings were preserved."
                )

            stock_rows = robinhood_stock_rows(
                positions,
                placeholder_id,
                synced_at,
            )
            crypto_rows = (
                [
                    {**row, "account_id": placeholder_id}
                    for row in crypto_preview
                ]
                if account_number == crypto_target_number
                else []
            )
            regular_equity = decimal(portfolio.get("equity"))
            extended_equity = decimal(portfolio.get("extended_hours_equity"))
            stock_equity = (
                extended_equity
                if extended_equity > Decimal("0")
                else regular_equity
            )
            account_crypto_value = (
                crypto_value
                if account_number == crypto_target_number
                else Decimal("0")
            )
            external_hash = hashlib.sha256(
                account_number.encode()
            ).hexdigest()[:24]
            name, official_name, subtype = robinhood_account_labels(
                account_profile
            )
            connected = not any(
                (
                    account_profile.get("deactivated"),
                    account_profile.get("permanently_deactivated"),
                    account_profile.get("state") not in (None, "active"),
                )
            )
            account_row = {
                "source": "robinhood",
                "external_id": f"robinhood:{external_hash}",
                "institution_name": "Robinhood",
                "name": name,
                "official_name": official_name,
                "account_type": "investment",
                "account_subtype": subtype,
                "mask": (
                    account_number[-4:] if len(account_number) >= 4 else None
                ),
                "currency_code": "USD",
                "current_balance": decimal_string(
                    stock_equity + account_crypto_value
                ),
                "available_balance": decimal_string(
                    account_profile.get("cash_available_for_withdrawal")
                    or account_profile.get("portfolio_cash")
                ),
                "connected": connected,
                "last_synced_at": synced_at,
                "metadata": {
                    "stock_equity": decimal_string(stock_equity),
                    "crypto_value": decimal_string(account_crypto_value),
                    "management_type": account_profile.get("management_type"),
                    "brokerage_account_type": account_profile.get(
                        "brokerage_account_type"
                    ),
                },
                "updated_at": synced_at,
            }
            prepared.append(
                {
                    "placeholder_id": placeholder_id,
                    "account_row": account_row,
                    "holding_rows": [*stock_rows, *crypto_rows],
                }
            )

        if store.dry_run:
            account_ids = {
                record["account_row"]["external_id"]: record["placeholder_id"]
                for record in prepared
            }
        else:
            persisted = store.upsert(
                "accounts",
                [record["account_row"] for record in prepared],
                "source,external_id",
            )
            account_ids = {
                str(row["external_id"]): int(row["id"])
                for row in persisted
                if row.get("external_id") and row.get("id") is not None
            }
            expected_ids = {
                record["account_row"]["external_id"] for record in prepared
            }
            if set(account_ids) != expected_ids:
                raise SyncError(
                    "Supabase did not return every Robinhood account."
                )

        snapshot_rows: list[dict[str, Any]] = []
        investment_snapshot_rows: list[dict[str, Any]] = []
        holding_rows: list[dict[str, Any]] = []
        holdings_by_account: dict[int, list[dict[str, Any]]] = {}
        for record in prepared:
            account_row = record["account_row"]
            account_id = account_ids[account_row["external_id"]]
            snapshot_rows.append(
                {
                    "account_id": account_id,
                    "snapshot_date": today_string(),
                    "balance": account_row["current_balance"],
                    "available_balance": account_row["available_balance"],
                }
            )
            account_holdings = [
                {**row, "account_id": account_id}
                for row in record["holding_rows"]
            ]
            holding_rows.extend(account_holdings)
            holdings_by_account[account_id] = account_holdings
            investment_snapshot_rows.append(
                {
                    "account_id": account_id,
                    "snapshot_date": today_string(),
                    "market_value": decimal_string(
                        sum(
                            (
                                decimal(row.get("current_value"))
                                for row in account_holdings
                            ),
                            Decimal("0"),
                        )
                    ),
                    "cost_basis": decimal_string(
                        sum(
                            (
                                decimal(row.get("cost_basis"))
                                for row in account_holdings
                            ),
                            Decimal("0"),
                        )
                    ),
                    "unrealized_gain": decimal_string(
                        sum(
                            (
                                decimal(row.get("unrealized_gain"))
                                for row in account_holdings
                            ),
                            Decimal("0"),
                        )
                    ),
                }
            )

        removed = 0
        if not store.dry_run:
            store.upsert(
                "balance_snapshots",
                snapshot_rows,
                "account_id,snapshot_date",
            )
            store.upsert(
                "holdings", holding_rows, "account_id,external_id"
            )
            store.upsert(
                "investment_snapshots",
                investment_snapshot_rows,
                "account_id,snapshot_date",
            )
            for account_id, account_holdings in holdings_by_account.items():
                incoming_ids = {
                    row["external_id"] for row in account_holdings
                }
                stale_ids = sorted(
                    store.existing_holding_ids(account_id) - incoming_ids
                )
                removed += store.delete_holding_external_ids(
                    account_id,
                    stale_ids,
                )

        managed_accounts = sum(
            1
            for profile in account_profiles
            if profile.get("management_type") == "managed"
        )
        counts = {
            "accounts": len(prepared),
            "snapshots": len(snapshot_rows),
            "investment_snapshots": len(investment_snapshot_rows),
            "stock_holdings": sum(
                1
                for row in holding_rows
                if row["asset_type"] != "crypto"
            ),
            "crypto_holdings": sum(
                1
                for row in holding_rows
                if row["asset_type"] == "crypto"
            ),
            "holdings_removed": removed,
        }
        return counts, {
            "institution": "Robinhood",
            "managed_accounts": managed_accounts,
        }
    finally:
        # logout() would revoke the token needed by tomorrow's Actions runner.
        clear_robinhood_session()


def run_source(
    source: str,
    store: SyncStore,
    settings: Settings,
    operation: Callable[[], Any],
) -> bool:
    run_id = store.begin(source)
    try:
        result = operation()
        if source == "plaid":
            counts, cursor, details = result
            store.succeed(
                source, run_id, counts, cursor=cursor, details=details
            )
        else:
            counts, details = result
            store.succeed(source, run_id, counts, details=details)
        LOGGER.info("%s sync succeeded: %s", source.title(), counts)
        return True
    except Exception as error:
        message = redact(error, settings)
        store.fail(source, run_id, message)
        LOGGER.error("%s sync failed: %s", source.title(), message)
        return False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        choices=("all", "plaid", "robinhood"),
        default="all",
        help=(
            "Provider to sync. Plaid always includes Robinhood when linked; "
            "robinhood remains available for brokerage-only troubleshooting."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and validate provider data without database writes.",
    )
    parser.add_argument(
        "--healthcheck",
        action="store_true",
        help="Check Supabase access and print safe configuration status.",
    )
    return parser.parse_args()


def selected_sources(source: str, settings: Settings) -> list[str]:
    """Keep every Plaid refresh paired with Robinhood when it is linked."""
    if source == "robinhood":
        return ["robinhood"]

    selected = ["plaid"]
    if settings.robinhood_configured:
        selected.append("robinhood")
    return selected


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    try:
        settings = Settings.from_environment()
    except Exception as error:
        LOGGER.error("Configuration failed: %s", error)
        return 2

    try:
        settings.validate_database()
        client = create_client(
            settings.supabase_url, settings.supabase_secret_key
        )
        store = SyncStore(client, dry_run=args.dry_run)
        # This also verifies that the secret key has table access.
        client.table("sync_states").select("source").limit(1).execute()
    except Exception as error:
        LOGGER.error("Supabase health check failed: %s", redact(error, settings))
        return 2

    if args.healthcheck:
        print(
            json.dumps(
                {
                    "database": "ok",
                    "plaid_configured": settings.plaid_configured,
                    "plaid_items_configured": len(
                        settings.plaid_access_tokens
                    ),
                    "robinhood_configured": settings.robinhood_configured,
                }
            )
        )
        return 0

    selected = selected_sources(args.source, settings)

    results: list[bool] = []
    for source in selected:
        if source == "plaid":
            results.append(
                run_source(
                    source,
                    store,
                    settings,
                    lambda: sync_plaid(settings, store),
                )
            )
        else:
            results.append(
                run_source(
                    source,
                    store,
                    settings,
                    lambda: sync_robinhood(settings, store),
                )
            )
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
