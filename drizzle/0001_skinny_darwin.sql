CREATE TABLE "budgets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "budgets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"category_primary" text NOT NULL,
	"monthly_limit" numeric(19, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_monthly_limit_positive" CHECK ("budgets"."monthly_limit" > 0)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transaction_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_category_primary_uidx" ON "budgets" USING btree ("category_primary");--> statement-breakpoint
CREATE INDEX "transactions_at_idx" ON "transactions" USING btree ("transaction_at");--> statement-breakpoint

-- Plaid only provides times for some institutions. Prefer authorized_datetime:
-- it reflects when the user acted, while datetime is usually the later post time.
UPDATE "public"."transactions"
SET "transaction_at" = COALESCE(
  CASE
    WHEN "raw_data"->>'authorized_datetime' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      THEN ("raw_data"->>'authorized_datetime')::timestamptz
  END,
  CASE
    WHEN "raw_data"->>'datetime' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      THEN ("raw_data"->>'datetime')::timestamptz
  END
)
WHERE "transaction_at" IS NULL;--> statement-breakpoint

-- Public is API-exposed. Browser roles intentionally cannot read finance data;
-- the Python sync's service role can access the table when needed.
ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."budgets" FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."budgets" TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "public"."budgets_id_seq" TO service_role;
