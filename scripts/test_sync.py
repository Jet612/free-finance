from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase

from scripts.plaid_link import find_public_tokens
from scripts.sync import decimal, plaid_account_row, plaid_transaction_row


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
