import type {
  PlaidAccount,
  PlaidHolding,
  PlaidSecurity,
  PlaidTransaction,
} from "@/lib/plaid/types";

/** Postgres stores these as exact numerics, so hand them over as fixed text. */
function money(value: number): string {
  return value.toFixed(4);
}

function currency(
  source: {
    iso_currency_code?: string | null;
    unofficial_currency_code?: string | null;
  },
): string {
  return source.iso_currency_code ?? source.unofficial_currency_code ?? "USD";
}

export function accountRow(
  account: PlaidAccount,
  institutionName: string,
  metadata: { item_id: string; institution_id: string | null },
  syncedAt: Date,
) {
  // Balances owed on credit and loan accounts count against net worth.
  const owed = account.type === "credit" || account.type === "loan";
  const current = account.balances.current ?? account.balances.available ?? 0;
  const available = account.balances.available;
  return {
    source: "plaid" as const,
    externalId: account.account_id,
    institutionName,
    name: account.name,
    officialName: account.official_name ?? null,
    accountType: account.type,
    accountSubtype: account.subtype ?? null,
    mask: account.mask ?? null,
    currencyCode: currency(account.balances),
    currentBalance: money(owed ? -current : current),
    availableBalance: available == null ? null : money(available),
    connected: true,
    lastSyncedAt: syncedAt,
    metadata,
    updatedAt: syncedAt,
  };
}

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function transactionRow(
  transaction: PlaidTransaction,
  accountId: number,
  syncedAt: Date,
) {
  const category = transaction.personal_finance_category;
  return {
    accountId,
    externalId: transaction.transaction_id,
    transactionDate: transaction.date,
    authorizedDate: transaction.authorized_date ?? null,
    // Not every institution returns a time. Authorization is closest to the
    // purchase; date-only records stay null rather than getting a made-up time.
    transactionAt:
      parseTimestamp(transaction.authorized_datetime) ??
      parseTimestamp(transaction.datetime),
    name:
      transaction.name ??
      transaction.merchant_name ??
      transaction.original_description ??
      "Transaction",
    merchantName: transaction.merchant_name ?? null,
    // Plaid's positive amount is money out; the app's positive is money in.
    amount: money(-transaction.amount),
    categoryPrimary: category?.primary ?? null,
    categoryDetailed: category?.detailed ?? null,
    pending: transaction.pending,
    paymentChannel: transaction.payment_channel ?? null,
    currencyCode: currency(transaction),
    logoUrl: transaction.logo_url ?? null,
    website: transaction.website ?? null,
    rawData: transaction,
    updatedAt: syncedAt,
  };
}

function holdingSymbol(security: PlaidSecurity | undefined, cash: boolean) {
  const ticker = security?.ticker_symbol?.trim();
  if (ticker) return ticker.replace(/^CUR:/, "").toUpperCase();
  if (cash) return "CASH";
  return security?.name?.trim().slice(0, 12).toUpperCase() || "UNKNOWN";
}

export type HoldingRow = ReturnType<typeof holdingRows>[number];

/**
 * Plaid can report the same security more than once in an account, for example
 * across tax lots. They're merged because the table keeps one row per security
 * per account. A missing cost basis stays null: brokerages don't always share
 * it, and treating it as zero would show the whole position as profit.
 */
export function holdingRows(
  holdings: PlaidHolding[],
  securities: PlaidSecurity[],
  accountIds: ReadonlyMap<string, number>,
  syncedAt: Date,
) {
  const securityById = new Map(
    securities.map((security) => [security.security_id, security]),
  );
  type Merged = {
    accountId: number;
    security: PlaidSecurity | undefined;
    securityId: string;
    quantity: number;
    value: number;
    basis: number | null;
    price: number | null;
    raw: PlaidHolding[];
  };
  const merged = new Map<string, Merged>();

  for (const holding of holdings) {
    const accountId = accountIds.get(holding.account_id);
    if (accountId === undefined || holding.quantity <= 0) continue;
    const key = `${accountId}:${holding.security_id}`;
    const value =
      holding.institution_value ??
      holding.quantity * (holding.institution_price ?? 0);
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += holding.quantity;
      existing.value += value;
      existing.basis =
        existing.basis === null || holding.cost_basis == null
          ? null
          : existing.basis + holding.cost_basis;
      existing.raw.push(holding);
    } else {
      merged.set(key, {
        accountId,
        security: securityById.get(holding.security_id),
        securityId: holding.security_id,
        quantity: holding.quantity,
        value,
        basis: holding.cost_basis ?? null,
        price: holding.institution_price ?? null,
        raw: [holding],
      });
    }
  }

  return Array.from(merged.values()).map((item) => {
    const cash =
      item.security?.is_cash_equivalent === true ||
      item.security?.type === "cash";
    // Cash has no gain, so its basis is simply its value.
    const basis = cash ? item.value : item.basis;
    const gain = basis === null ? null : item.value - basis;
    return {
      accountId: item.accountId,
      externalId: `security:${item.securityId}`,
      symbol: holdingSymbol(item.security, cash),
      name: item.security?.name ?? "Unknown security",
      assetType: cash ? "cash" : (item.security?.type ?? "other"),
      quantity: String(item.quantity),
      averageCost:
        basis === null ? null : (basis / item.quantity).toFixed(6),
      currentPrice: item.price === null ? null : item.price.toFixed(6),
      currentValue: money(item.value),
      costBasis: basis === null ? null : money(basis),
      unrealizedGain: gain === null ? null : money(gain),
      unrealizedGainPercent:
        gain === null || !basis ? null : ((gain / basis) * 100).toFixed(6),
      rawData: { holdings: item.raw, security: item.security ?? null },
      syncedAt,
      updatedAt: syncedAt,
    };
  });
}

/** One row per account per day, so gains can be charted over time. */
export function investmentSnapshotRows(
  rows: HoldingRow[],
  snapshotDate: string,
) {
  const totals = new Map<
    number,
    { market: number; basis: number; gain: number }
  >();
  for (const row of rows) {
    const total = totals.get(row.accountId) ?? { market: 0, basis: 0, gain: 0 };
    total.market += Number(row.currentValue);
    total.basis += Number(row.costBasis ?? 0);
    total.gain += Number(row.unrealizedGain ?? 0);
    totals.set(row.accountId, total);
  }
  return Array.from(totals, ([accountId, total]) => ({
    accountId,
    snapshotDate,
    marketValue: money(total.market),
    costBasis: money(total.basis),
    unrealizedGain: money(total.gain),
  }));
}
