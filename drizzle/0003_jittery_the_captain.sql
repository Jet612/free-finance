DROP INDEX "subscription_rules_type_idx";--> statement-breakpoint
CREATE INDEX "subscription_rules_source_transaction_idx" ON "subscription_rules" USING btree ("source_transaction_id");