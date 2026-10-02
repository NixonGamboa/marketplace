CREATE TABLE IF NOT EXISTS "catalog_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"slug" text,
	"illustration_url" text,
	"sort_order" integer,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalog_categories_store_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "catalog_categories_store_slug_unique" UNIQUE("store_id","slug"),
	CONSTRAINT "catalog_categories_version_positive" CHECK ("catalog_categories"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog_products" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"legal_name" text,
	"price" integer NOT NULL,
	"original_price" integer,
	"unit" text NOT NULL,
	"image_url" text NOT NULL,
	"in_stock" boolean NOT NULL,
	"is_variable_weight" boolean NOT NULL,
	"badge" text,
	"currency" text NOT NULL,
	"description" text,
	"nutritional_info" jsonb,
	"availability_label" text,
	"active" boolean NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalog_products_price_valid" CHECK ("catalog_products"."price" between 1 and 100000000 and ("catalog_products"."original_price" is null or ("catalog_products"."original_price" > "catalog_products"."price" and "catalog_products"."original_price" <= 100000000))),
	CONSTRAINT "catalog_products_currency_cop" CHECK ("catalog_products"."currency" = 'COP'),
	CONSTRAINT "catalog_products_unit_coherent" CHECK (("catalog_products"."is_variable_weight" and "catalog_products"."unit" = 'Por Kilogramo') or (not "catalog_products"."is_variable_weight" and "catalog_products"."unit" <> 'Por Kilogramo')),
	CONSTRAINT "catalog_products_version_positive" CHECK ("catalog_products"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_phone" text,
	"address" text NOT NULL,
	"time_zone" text NOT NULL,
	"weekly_schedule" jsonb NOT NULL,
	"schedule_override" text NOT NULL,
	"delivery_enabled" boolean NOT NULL,
	"shipping_cost" integer NOT NULL,
	"free_shipping_threshold" integer,
	"delivery_cutoff" text,
	"coverage_note" text,
	"time_slots" jsonb NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stores_time_zone_valid" CHECK ("stores"."time_zone" = 'America/Bogota'),
	CONSTRAINT "stores_schedule_override_valid" CHECK ("stores"."schedule_override" in ('auto', 'open', 'closed')),
	CONSTRAINT "stores_delivery_amounts_valid" CHECK ("stores"."shipping_cost" between 0 and 100000000 and ("stores"."free_shipping_threshold" is null or "stores"."free_shipping_threshold" between 1 and 100000000)),
	CONSTRAINT "stores_contact_phone_valid" CHECK ("stores"."contact_phone" is null or ("stores"."contact_phone" ~ '^573[0-9]{9}$' and "stores"."contact_phone" <> '573000000000')),
	CONSTRAINT "stores_version_positive" CHECK ("stores"."version" >= 1)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_category_same_store_fk" FOREIGN KEY ("store_id","category_id") REFERENCES "public"."catalog_categories"("store_id","id") ON DELETE restrict ON UPDATE restrict;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_products_by_store" ON "catalog_products" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_products_by_category" ON "catalog_products" USING btree ("store_id","category_id");