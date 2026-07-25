#!/usr/bin/env python3
"""Read-only provider sync for Free Finance.

Plaid and Robinhood are fetched independently. Database writes are idempotent,
and a provider cursor advances only after every corresponding write succeeds.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import signal
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Iterator, Sequence
from zoneinfo import ZoneInfo

import plaid
import pyotp
import robin_stocks.robinhood as robinhood
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

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local", override=False)

LOGGER = logging.getLogger("free-finance-sync")
UTC = timezone.utc
TABLE_BATCH_SIZE = 400


class SyncError(RuntimeError):
    """A user-actionable provider or configuration failure."""


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_secret_key: str
    plaid_environment: str
    plaid_client_id: str
    plaid_secret: str
    plaid_access_token: str
    robinhood_username: str
    robinhood_password: str
    robinhood_totp_secret: str

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            supabase_url=os.getenv("SUPABASE_URL", "").strip(),
            supabase_secret_key=os.getenv("SUPABASE_SECRET_KEY", "").strip(),
            plaid_environment=os.getenv("PLAID_ENV", "sandbox").strip().lower(),
            plaid_client_id=os.getenv("PLAID_CLIENT_ID", "").strip(),
            plaid_secret=os.getenv("PLAID_SECRET", "").strip(),
            plaid_access_token=os.getenv("PLAID_ACCESS_TOKEN", "").strip(),
            robinhood_username=os.getenv("ROBINHOOD_USERNAME", "").strip(),
            robinhood_password=os.getenv("ROBINHOOD_PASSWORD", "").strip(),
            robinhood_totp_secret=os.getenv("ROBINHOOD_TOTP_SECRET", "").strip(),
        )

    @property
    def plaid_configured(self) -> bool:
        return all(
            (self.plaid_client_id, self.plaid_secret, self.plaid_access_token)
        )

    @property
    def robinhood_configured(self) -> bool:
        return all(
            (
                self.robinhood_username,
                self.robinhood_password,
                self.robinhood_totp_secret,
            )
        )

    def validate_database(self) -> None:
        if not self.supabase_url or not self.supabase_secret_key:
            raise SyncError(
                "SUPABASE_URL and SUPABASE_SECRET_KEY must both be configured."
            )

    def validate_plaid(self) -> None:
        if not self.plaid_configured:
            raise SyncError(
                "Plaid is incomplete. Set PLAID_CLIENT_ID, PLAID_SECRET, and "
                "PLAID_ACCESS_TOKEN."
            )
        if self.plaid_environment not in {"sandbox", "production"}:
            raise SyncError("PLAID_ENV must be either sandbox or production.")

    def validate_robinhood(self) -> None:
        values = (
            self.robinhood_username,
            self.robinhood_password,
            self.robinhood_totp_secret,
        )
        if any(values) and not all(values):
            raise SyncError(
                "Robinhood is partially configured. Set all three ROBINHOOD_* "
                "variables or leave all three empty."
            )
        if not self.robinhood_configured:
            raise SyncError("Robinhood sync is not configured.")

    @property
    def secrets(self) -> tuple[str, ...]:
        return tuple(
            value
            for value in (
                self.supabase_secret_key,
                self.plaid_client_id,
                self.plaid_secret,
                self.plaid_access_token,
                self.robinhood_username,
                self.robinhood_password,
                self.robinhood_totp_secret,
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
    fallback: str = "Plaid",
) -> tuple[str, dict[str, Any]]:
    try:
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
        response = client.institutions_get_by_id(
            InstitutionsGetByIdRequest(
                institution_id=institution_id,
                country_codes=[CountryCode("US")],
            )
        )
        return response.institution.name or fallback, metadata
    except Exception as error:  # Institution labels should not block balances.
        LOGGER.warning("Institution lookup failed: %s", type(error).__name__)
        return fallback, {}


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
    return {
        "account_id": account_id,
        "external_id": transaction.transaction_id,
        "transaction_date": str(transaction.date),
        "authorized_date": (
            str(transaction.authorized_date)
            if transaction.authorized_date
            else None
        ),
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


def sync_plaid(
    settings: Settings, store: SyncStore
) -> tuple[dict[str, int], str, dict[str, Any]]:
    settings.validate_plaid()
    client, _api_client = plaid_client(settings)
    synced_at = iso_now()
    institution_name, item_metadata = fetch_plaid_institution_name(
        client, settings.plaid_access_token
    )
    balance_response = client.accounts_balance_get(
        AccountsBalanceGetRequest(access_token=settings.plaid_access_token)
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

    starting_cursor = store.get_cursor("plaid")
    added, modified, removed, next_cursor = fetch_plaid_transaction_changes(
        client, settings.plaid_access_token, starting_cursor
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
    return counts, next_cursor, {
        "institution": institution_name,
        "environment": settings.plaid_environment,
    }


@contextmanager
def robinhood_login_deadline(seconds: int = 150) -> Iterator[None]:
    """Interrupt Robinhood's interactive challenge loops on unattended runners."""
    if not hasattr(signal, "SIGALRM"):
        yield
        return

    def raise_timeout(_signum: int, _frame: Any) -> None:
        raise SyncError(
            "Robinhood needs interactive device verification. Approve the "
            "login in Robinhood, then manually rerun the workflow."
        )

    previous_handler = signal.signal(signal.SIGALRM, raise_timeout)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous_handler)


def robinhood_stock_rows(
    holdings: dict[str, dict[str, Any]], account_id: int, synced_at: str
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for symbol, holding in holdings.items():
        quantity = decimal(holding.get("quantity"))
        if quantity <= 0:
            continue
        average_cost = decimal(holding.get("average_buy_price"))
        current_price = decimal(holding.get("price"))
        current_value = decimal(holding.get("equity"), quantity * current_price)
        cost_basis = quantity * average_cost
        gain = current_value - cost_basis
        gain_percent = (
            (gain / cost_basis) * Decimal("100")
            if cost_basis
            else Decimal("0")
        )
        rows.append(
            {
                "account_id": account_id,
                "external_id": f"stock:{holding.get('id') or symbol}",
                "symbol": symbol.upper(),
                "name": holding.get("name") or symbol.upper(),
                "asset_type": holding.get("type") or "stock",
                "quantity": decimal_string(quantity),
                "average_cost": decimal_string(average_cost),
                "current_price": decimal_string(current_price),
                "current_value": decimal_string(current_value),
                "cost_basis": decimal_string(cost_basis),
                "unrealized_gain": decimal_string(gain),
                "unrealized_gain_percent": decimal_string(gain_percent),
                "raw_data": jsonable(holding),
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
    mfa_code = pyotp.TOTP(settings.robinhood_totp_secret).now()
    synced_at = iso_now()
    try:
        with robinhood_login_deadline():
            # No pickle means an Actions runner never writes reusable credentials.
            robinhood.login(
                settings.robinhood_username,
                settings.robinhood_password,
                mfa_code=mfa_code,
                store_session=False,
            )
        account_profile = robinhood.load_account_profile()
        portfolio = robinhood.load_portfolio_profile()
        if not account_profile or not portfolio:
            raise SyncError(
                "Robinhood login failed or returned no account profile."
            )

        stock_holdings = robinhood.build_holdings() or {}
        stock_market_value = decimal(portfolio.get("market_value"))
        if stock_market_value > Decimal("0.01") and not stock_holdings:
            raise SyncError(
                "Robinhood reported invested value but returned no stock "
                "positions; existing holdings were preserved."
            )
        crypto_positions = robinhood.get_crypto_positions()
        if crypto_positions is None:
            raise SyncError(
                "Robinhood crypto positions were unavailable; existing "
                "holdings were preserved."
            )

        account_number = str(
            account_profile.get("account_number")
            or account_profile.get("rhs_account_number")
            or settings.robinhood_username
        )
        external_hash = hashlib.sha256(account_number.encode()).hexdigest()[:24]
        stock_equity = max(
            decimal(portfolio.get("equity")),
            decimal(portfolio.get("extended_hours_equity")),
        )

        placeholder_id = 1
        crypto_preview = robinhood_crypto_rows(
            list(crypto_positions), placeholder_id, synced_at
        )
        crypto_value = sum(
            (decimal(row["current_value"]) for row in crypto_preview),
            Decimal("0"),
        )
        account_row = {
            "source": "robinhood",
            "external_id": f"robinhood:{external_hash}",
            "institution_name": "Robinhood",
            "name": "Brokerage",
            "official_name": "Robinhood Brokerage",
            "account_type": "investment",
            "account_subtype": "brokerage",
            "mask": account_number[-4:] if len(account_number) >= 4 else None,
            "currency_code": "USD",
            "current_balance": decimal_string(stock_equity + crypto_value),
            "available_balance": decimal_string(
                account_profile.get("cash_available_for_withdrawal")
                or account_profile.get("portfolio_cash")
            ),
            "connected": True,
            "last_synced_at": synced_at,
            "metadata": {
                "stock_equity": decimal_string(stock_equity),
                "crypto_value": decimal_string(crypto_value),
            },
            "updated_at": synced_at,
        }

        if store.dry_run:
            account_id = placeholder_id
        else:
            persisted = store.upsert(
                "accounts", [account_row], "source,external_id"
            )
            if not persisted:
                raise SyncError("Supabase did not return the Robinhood account.")
            account_id = int(persisted[0]["id"])

        stock_rows = robinhood_stock_rows(
            stock_holdings, account_id, synced_at
        )
        crypto_rows = [
            {**row, "account_id": account_id} for row in crypto_preview
        ]
        holding_rows = [*stock_rows, *crypto_rows]

        if not store.dry_run:
            store.upsert(
                "balance_snapshots",
                [
                    {
                        "account_id": account_id,
                        "snapshot_date": today_string(),
                        "balance": account_row["current_balance"],
                        "available_balance": account_row["available_balance"],
                    }
                ],
                "account_id,snapshot_date",
            )
            store.upsert(
                "holdings", holding_rows, "account_id,external_id"
            )
            incoming_ids = {row["external_id"] for row in holding_rows}
            stale_ids = sorted(
                store.existing_holding_ids(account_id) - incoming_ids
            )
            removed = store.delete_external_ids("holdings", stale_ids)
        else:
            removed = 0

        counts = {
            "accounts": 1,
            "snapshots": 1,
            "stock_holdings": len(stock_rows),
            "crypto_holdings": len(crypto_rows),
            "holdings_removed": removed,
        }
        return counts, {"institution": "Robinhood"}
    finally:
        try:
            robinhood.logout()
        except Exception:
            LOGGER.debug("Robinhood logout did not complete.")


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
        help="Provider to sync (default: all configured providers).",
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


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    settings = Settings.from_environment()
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
                    "robinhood_configured": settings.robinhood_configured,
                }
            )
        )
        return 0

    selected: list[str]
    if args.source == "all":
        selected = ["plaid"]
        robinhood_values = (
            settings.robinhood_username,
            settings.robinhood_password,
            settings.robinhood_totp_secret,
        )
        if any(robinhood_values):
            selected.append("robinhood")
    else:
        selected = [args.source]

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
