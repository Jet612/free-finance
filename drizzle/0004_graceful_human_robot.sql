CREATE TABLE "investment_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "investment_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" bigint NOT NULL,
	"snapshot_date" date NOT NULL,
	"market_value" numeric(19, 4) NOT NULL,
	"cost_basis" numeric(19, 4) NOT NULL,
	"unrealized_gain" numeric(19, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investment_snapshots" ADD CONSTRAINT "investment_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investment_snapshots_account_date_uidx" ON "investment_snapshots" USING btree ("account_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "investment_snapshots_date_idx" ON "investment_snapshots" USING btree ("snapshot_date");--> statement-breakpoint

-- Seed the first exact unrealized gain/loss point from the current holdings.
INSERT INTO "public"."investment_snapshots" (
  "account_id",
  "snapshot_date",
  "market_value",
  "cost_basis",
  "unrealized_gain"
)
SELECT
  accounts.id,
  current_date,
  coalesce(sum(holdings.current_value), 0),
  coalesce(sum(holdings.cost_basis), 0),
  coalesce(sum(holdings.unrealized_gain), 0)
FROM "public"."accounts"
LEFT JOIN "public"."holdings" ON holdings.account_id = accounts.id
WHERE accounts.connected = true
  AND (
    accounts.account_type = 'investment'
    OR accounts.source = 'robinhood'
  )
GROUP BY accounts.id;--> statement-breakpoint

-- Investment history is private financial data and remains server-only.
ALTER TABLE "public"."investment_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."investment_snapshots" FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."investment_snapshots" TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "public"."investment_snapshots_id_seq" TO service_role;
