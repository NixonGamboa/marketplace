ALTER TABLE "orders" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "original_items" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "item_adjustments" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_version_positive" CHECK ("orders"."version" >= 1);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancellation_shape" CHECK (("orders"."cancellation_reason" is null and "orders"."cancelled_at" is null) or ("orders"."cancellation_reason" is not null and "orders"."cancelled_at" is not null and "orders"."status" = 'cancelled'));