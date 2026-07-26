"""Shared parsing for public Plaid configuration.

Access tokens stay in environment secret stores. The plural variable is JSON so
GitHub can hold multiple independent Plaid Items in one encrypted secret.
"""

from __future__ import annotations

import json

from plaid.model.country_code import CountryCode

# Follow the pinned Plaid SDK instead of maintaining a second country allowlist.
SUPPORTED_COUNTRY_CODES = frozenset(
    CountryCode.allowed_values[("value",)].values()
)


def parse_access_tokens(plural: str, legacy: str = "") -> tuple[str, ...]:
    """Return unique Plaid Item tokens without logging or normalizing them."""
    tokens: list[str] = []
    value = plural.strip()
    if value:
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError(
                "PLAID_ACCESS_TOKENS must be a JSON array of strings."
            ) from error
        if not isinstance(decoded, list) or any(
            not isinstance(token, str) or not token.strip()
            for token in decoded
        ):
            raise ValueError(
                "PLAID_ACCESS_TOKENS must be a JSON array of non-empty strings."
            )
        tokens.extend(token.strip() for token in decoded)

    if legacy.strip():
        tokens.append(legacy.strip())
    return tuple(dict.fromkeys(tokens))


def encode_access_tokens(tokens: tuple[str, ...] | list[str]) -> str:
    """Serialize tokens compactly for .env.local and GitHub Secrets."""
    return json.dumps(list(dict.fromkeys(tokens)), separators=(",", ":"))


def parse_country_codes(value: str) -> tuple[str, ...]:
    """Parse the Plaid countries enabled for this fork's users."""
    countries = tuple(
        dict.fromkeys(
            code.strip().upper()
            for code in (value or "US").split(",")
            if code.strip()
        )
    )
    invalid = sorted(set(countries) - SUPPORTED_COUNTRY_CODES)
    if not countries or invalid:
        detail = ", ".join(invalid) if invalid else "none provided"
        raise ValueError(
            "PLAID_COUNTRY_CODES contains unsupported values: "
            f"{detail}. Use comma-separated ISO country codes."
        )
    return countries
