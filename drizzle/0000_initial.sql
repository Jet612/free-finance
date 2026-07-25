CREATE TYPE "public"."account_source" AS ENUM('plaid', 'robinhood', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'success', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "public"."accounts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" "account_source" NOT NULL,
	"external_id" text NOT NULL,
	"institution_name" text NOT NULL,
	"name" text NOT NULL,
	"official_name" text,
	"account_type" text NOT NULL,
	"account_subtype" text,
	"mask" text,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"current_balance" numeric(19, 4) DEFAULT '0' NOT NULL,
	"available_balance" numeric(19, 4),
	"connected" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public"."balance_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "balance_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" bigint NOT NULL,
	"snapshot_date" date NOT NULL,
	"balance" numeric(19, 4) NOT NULL,
	"available_balance" numeric(19, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public"."holdings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "holdings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" bigint NOT NULL,
	"external_id" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"asset_type" text NOT NULL,
	"quantity" numeric(28, 10) NOT NULL,
	"average_cost" numeric(19, 6),
	"current_price" numeric(19, 6),
	"current_value" numeric(19, 4) NOT NULL,
	"cost_basis" numeric(19, 4),
	"unrealized_gain" numeric(19, 4),
	"unrealized_gain_percent" numeric(12, 6),
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public"."sync_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "public"."sync_states" (
	"source" text PRIMARY KEY NOT NULL,
	"cursor" text,
	"status" "sync_status" DEFAULT 'skipped' NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public"."transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" bigint NOT NULL,
	"external_id" text NOT NULL,
	"transaction_date" date NOT NULL,
	"authorized_date" date,
	"name" text NOT NULL,
	"merchant_name" text,
	"amount" numeric(19, 4) NOT NULL,
	"category_primary" text,
	"category_detailed" text,
	"pending" boolean DEFAULT false NOT NULL,
	"payment_channel" text,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"logo_url" text,
	"website" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "public"."balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."holdings" ADD CONSTRAINT "holdings_quantity_nonnegative" CHECK ("quantity" >= 0);--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_source_external_id_uidx" ON "public"."accounts" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "accounts_source_connected_idx" ON "public"."accounts" USING btree ("source","connected");--> statement-breakpoint
CREATE UNIQUE INDEX "balance_snapshots_account_date_uidx" ON "public"."balance_snapshots" USING btree ("account_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "balance_snapshots_date_idx" ON "public"."balance_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_account_external_id_uidx" ON "public"."holdings" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "holdings_account_id_idx" ON "public"."holdings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "holdings_asset_type_idx" ON "public"."holdings" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "sync_runs_source_started_idx" ON "public"."sync_runs" USING btree ("source","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_external_id_uidx" ON "public"."transactions" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "public"."transactions" USING btree ("account_id","transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "public"."transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_category_date_idx" ON "public"."transactions" USING btree ("category_primary","transaction_date");--> statement-breakpoint

-- Public is an API-exposed schema. With RLS enabled and no browser-role policies,
-- only the server-side database owner and service_role can access finance data.
ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."balance_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."holdings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."sync_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON TABLE
  "public"."accounts",
  "public"."balance_snapshots",
  "public"."transactions",
  "public"."holdings",
  "public"."sync_states",
  "public"."sync_runs"
FROM anon, authenticated;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "public"."accounts",
  "public"."balance_snapshots",
  "public"."transactions",
  "public"."holdings",
  "public"."sync_states",
  "public"."sync_runs"
TO service_role;--> statement-breakpoint

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO service_role;
