import base64
import json
from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from scripts.plaid_config import (
    encode_access_tokens,
    parse_access_tokens,
    parse_country_codes,
)
from scripts.plaid_link import find_public_tokens, plaid_api_error_message
from scripts.sync import (
    SyncError,
    Settings,
    decimal,
    decode_robinhood_session,
    encode_plaid_cursor_state,
    parse_plaid_cursor_state,
    plaid_account_row,
    plaid_transaction_row,
    sync_plaid,
)


class SyncNormalizationTests(TestCase):
    def test_plaid_credit_balance_is_a_liability(self) -> None:
        account = SimpleNamespace(
            account_id="credit-1",
            type="credit",
            subtype="credit card",
            name="Travel card",
            official_name=None,
            mask="1234",
            balances=SimpleNamespace(
                current=Decimal("725.50"),
                available=Decimal("4274.50"),
                iso_currency_code="USD",
                unofficial_currency_code=None,
            ),
        )

        row = plaid_account_row(account, "Bank", {}, "2026-01-01T00:00:00Z")

        self.assertEqual(row["current_balance"], "-725.50")
        self.assertEqual(row["account_type"], "credit")

    def test_plaid_spending_is_negative_and_income_positive(self) -> None:
        def transaction(amount: str) -> SimpleNamespace:
            return SimpleNamespace(
                transaction_id=f"transaction-{amount}",
                account_id="account-1",
                date="2026-01-01",
                authorized_date=None,
                datetime=None,
                authorized_datetime=None,
                name="Example",
                merchant_name=None,
                amount=Decimal(amount),
                personal_finance_category=None,
                pending=False,
                payment_channel=None,
                iso_currency_code="USD",
                unofficial_currency_code=None,
                logo_url=None,
                website=None,
                to_dict=lambda: {"amount": amount},
            )

        spending = plaid_transaction_row(transaction("12.34"), 1)
        income = plaid_transaction_row(transaction("-100.00"), 1)

        self.assertEqual(decimal(spending["amount"]), Decimal("-12.34"))
        self.assertEqual(decimal(income["amount"]), Decimal("100.00"))

    def test_plaid_transaction_prefers_authorized_timestamp(self) -> None:
        transaction = SimpleNamespace(
            transaction_id="transaction-timed",
            account_id="account-1",
            date="2026-01-01",
            authorized_date="2025-12-31",
            datetime="2026-01-01T14:42:00-05:00",
            authorized_datetime="2025-12-31T11:15:00-05:00",
            name="Example",
            merchant_name=None,
            amount=Decimal("12.34"),
            personal_finance_category=None,
            pending=False,
            payment_channel=None,
            iso_currency_code="USD",
            unofficial_currency_code=None,
            logo_url=None,
            website=None,
            to_dict=lambda: {},
        )

        row = plaid_transaction_row(transaction, 1)

        self.assertEqual(
            row["transaction_at"], "2025-12-31T11:15:00-05:00"
        )

    def test_hosted_link_finds_nested_public_tokens(self) -> None:
        payload = {
            "link_sessions": [
                {
                    "results": {
                        "public_tokens": [
                            "public-sandbox-safe-example",
                            "public-sandbox-safe-example",
                        ]
                    }
                }
            ]
        }

        self.assertEqual(
            find_public_tokens(payload), ["public-sandbox-safe-example"]
        )

    def test_plaid_key_error_explains_environment_mismatch(self) -> None:
        message = plaid_api_error_message(
            '{"error_code":"INVALID_API_KEYS",'
            '"error_message":"invalid client_id or secret provided"}',
            "production",
            400,
        )

        self.assertIn("rejected the API keys for Production", message)
        self.assertIn("secret may belong to Sandbox", message)
        self.assertIn("activate Plaid Trial", message)

    def test_plaid_tokens_support_multiple_items_and_legacy_forks(self) -> None:
        tokens = parse_access_tokens(
            '["access-first","access-second","access-first"]',
            "access-legacy",
        )

        self.assertEqual(
            tokens,
            ("access-first", "access-second", "access-legacy"),
        )
        self.assertEqual(
            encode_access_tokens(tokens),
            '["access-first","access-second","access-legacy"]',
        )

    def test_plaid_tokens_reject_non_array_configuration(self) -> None:
        with self.assertRaisesRegex(ValueError, "JSON array"):
            parse_access_tokens('"access-not-an-array"')

    def test_plaid_country_codes_are_normalized_and_deduplicated(self) -> None:
        self.assertEqual(
            parse_country_codes(" us, ca,US "),
            ("US", "CA"),
        )

    def test_plaid_country_codes_reject_unknown_values(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported values: ZZ"):
            parse_country_codes("US,ZZ")

    def test_plaid_cursor_upgrades_from_single_item_format(self) -> None:
        self.assertEqual(
            parse_plaid_cursor_state("legacy-opaque-cursor", ["item-first"]),
            {"item-first": "legacy-opaque-cursor"},
        )

    def test_plaid_cursor_round_trips_multiple_items(self) -> None:
        cursors = {
            "item-second": "cursor-two",
            "item-first": "cursor-one",
        }

        encoded = encode_plaid_cursor_state(cursors)

        self.assertEqual(
            parse_plaid_cursor_state(
                encoded,
                ["item-first", "item-second"],
            ),
            cursors,
        )

    def test_plaid_sync_aggregates_multiple_items(self) -> None:
        settings = Settings(
            supabase_url="https://example.supabase.co",
            supabase_secret_key="secret",
            plaid_environment="production",
            plaid_client_id="client",
            plaid_secret="secret",
            plaid_access_tokens=("access-first", "access-second"),
            plaid_country_codes=("US", "CA"),
            robinhood_session_b64="",
        )
        store = SimpleNamespace(
            get_cursor=lambda source: encode_plaid_cursor_state(
                {
                    "item-first": "cursor-first",
                    "item-second": "cursor-second",
                }
            )
        )

        with (
            patch(
                "scripts.sync.plaid_client",
                return_value=(SimpleNamespace(), SimpleNamespace()),
            ),
            patch(
                "scripts.sync.fetch_plaid_institution_name",
                side_effect=[
                    ("First Bank", {"item_id": "item-first"}),
                    ("Second Credit Union", {"item_id": "item-second"}),
                ],
            ),
            patch(
                "scripts.sync.sync_plaid_item",
                side_effect=[
                    ({"accounts": 2, "transactions_added": 3}, "next-first"),
                    ({"accounts": 1, "transactions_added": 4}, "next-second"),
                ],
            ) as item_sync,
        ):
            counts, cursor, details = sync_plaid(settings, store)

        self.assertEqual(
            counts,
            {"accounts": 3, "transactions_added": 7},
        )
        self.assertEqual(
            parse_plaid_cursor_state(
                cursor,
                ["item-first", "item-second"],
            ),
            {
                "item-first": "next-first",
                "item-second": "next-second",
            },
        )
        self.assertEqual(
            details["institutions"],
            ["First Bank", "Second Credit Union"],
        )
        self.assertEqual(details["items"], 2)
        self.assertEqual(
            [call.args[-1] for call in item_sync.call_args_list],
            ["cursor-first", "cursor-second"],
        )

    def test_robinhood_session_decodes_validated_credentials(self) -> None:
        payload = {
            "version": 1,
            "access_token": "access",
            "token_type": "Bearer",
            "refresh_token": "refresh",
            "device_token": "device",
        }
        encoded = base64.b64encode(json.dumps(payload).encode()).decode()

        session = decode_robinhood_session(encoded)

        self.assertEqual(session["access_token"], "access")
        self.assertEqual(session["device_token"], "device")

    def test_robinhood_session_rejects_missing_credentials(self) -> None:
        encoded = base64.b64encode(
            json.dumps({"version": 1, "access_token": "access"}).encode()
        ).decode()

        with self.assertRaises(SyncError):
            decode_robinhood_session(encoded)
