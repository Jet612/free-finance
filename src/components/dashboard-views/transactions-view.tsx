import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { TransactionsExplorer } from "@/components/transactions-explorer";
import type { TransactionsData } from "@/lib/detail-data";
import {
  DEFAULT_FILTERS,
  parseTransactionFilters,
} from "@/lib/transaction-filters";

type SearchParams = Record<string, string | string[] | undefined>;

export function TransactionsView({
  data,
  searchParams,
  demo = false,
}: {
  data: TransactionsData;
  searchParams: SearchParams;
  demo?: boolean;
}) {
  const open = Number(searchParams.open);
  const filters = parseTransactionFilters(searchParams);
  // A link to something recent lands in the normal list, not all of history.
  const target = data.transactions.find((item) => item.id === open);
  const onlyOpen = Object.keys(searchParams).length === 1 && target;
  const initialFilters =
    onlyOpen && target.date >= data.periodStarts.last30Days
      ? { ...filters, period: DEFAULT_FILTERS.period }
      : filters;
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="Transactions"
        detail={
          data.metrics.pending > 0 ? (
            <>
              <Money value={data.metrics.pending} /> is still pending and isn&apos;t in your totals yet.
            </>
          ) : undefined
        }
      />
      <TransactionsExplorer
        data={data}
        demo={demo}
        basePath={demo ? "/demo" : ""}
        initialFilters={initialFilters}
        initialOpenId={Number.isInteger(open) && open > 0 ? open : undefined}
      />
    </div>
  );
}
