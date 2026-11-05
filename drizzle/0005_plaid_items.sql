CREATE TYPE "public"."plaid_item_status" AS ENUM('active', 'login_required', 'error');--> statement-breakpoint
CREATE TABLE "app_owner" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_owner_single_row" CHECK ("app_owner"."singleton")
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "plaid_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"item_id" text NOT NULL,
	"institution_id" text,
	"institution_name" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"cursor" text,
	"status" "plaid_item_status" DEFAULT 'active' NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plaid_items_item_id_uidx" ON "plaid_items" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "public"."app_owner" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."plaid_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."app_owner", "public"."plaid_items" FROM anon, authenticated, service_role;--> statement-breakpoint
-- Robinhood now connects through Plaid. Its old accounts stop counting toward
-- totals, but their history stays in place rather than being deleted.
UPDATE "public"."accounts" SET "connected" = false, "updated_at" = now() WHERE "source" = 'robinhood';--> statement-breakpoint
DELETE FROM "public"."sync_states" WHERE "source" = 'robinhood';
