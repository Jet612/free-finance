import base64
import json
from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase

from scripts.plaid_link import find_public_tokens, plaid_api_error_message
from scripts.sync import (
    SyncError,
    decimal,
    decode_robinhood_session,
    plaid_account_row,
    plaid_transaction_row,
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
