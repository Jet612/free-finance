CREATE TABLE "merchant_rules" (
	"merchant" text PRIMARY KEY NOT NULL,
	"category_primary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "ignored" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."merchant_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."merchant_rules" FROM anon, authenticated, service_role;
