CREATE TABLE "subscription_rules" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscription_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"stream_key" text NOT NULL,
	"rule_type" text NOT NULL,
	"merchant_name" text NOT NULL,
	"category_primary" text,
	"category_detailed" text,
	"cadence" text,
	"amount" numeric(19, 4),
	"last_charged_at" timestamp with time zone,
	"source_transaction_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_rules_valid_type" CHECK ("subscription_rules"."rule_type" in ('included', 'excluded')),
	CONSTRAINT "subscription_rules_valid_inclusion" CHECK ((
        (
          "subscription_rules"."rule_type" = 'excluded'
          and "subscription_rules"."cadence" is null
          and "subscription_rules"."amount" is null
          and "subscription_rules"."last_charged_at" is null
        )
        or
        (
          "subscription_rules"."rule_type" = 'included'
          and "subscription_rules"."cadence" in ('weekly', 'biweekly', 'monthly', 'quarterly', 'annual')
          and "subscription_rules"."amount" > 0
          and "subscription_rules"."last_charged_at" is not null
        )
      ))
);
--> statement-breakpoint
ALTER TABLE "subscription_rules" ADD CONSTRAINT "subscription_rules_source_transaction_id_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_rules_stream_key_uidx" ON "subscription_rules" USING btree ("stream_key");--> statement-breakpoint
CREATE INDEX "subscription_rules_type_idx" ON "subscription_rules" USING btree ("rule_type");--> statement-breakpoint

-- Subscription corrections contain private merchant and amount data. They are
-- server-only, matching the rest of the single-tenant finance tables.
ALTER TABLE "public"."subscription_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."subscription_rules" FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."subscription_rules" TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "public"."subscription_rules_id_seq" TO service_role;
