CREATE TABLE IF NOT EXISTS "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"items" jsonb NOT NULL,
	"total" integer NOT NULL,
	"status" text NOT NULL,
	"delivery_mode" text NOT NULL,
	"delivery_address" text,
	"substitution_preference" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_by_store_status" ON "orders" USING btree ("store_id","status","created_at");