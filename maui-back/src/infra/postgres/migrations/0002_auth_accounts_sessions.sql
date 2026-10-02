CREATE TABLE IF NOT EXISTS "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"store_id" text,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_accounts_status_valid" CHECK ("auth_accounts"."status" in ('active', 'disabled')),
	CONSTRAINT "auth_accounts_identity_shape" CHECK (("auth_accounts"."role" = 'customer' and "auth_accounts"."phone" is not null and "auth_accounts"."email" is null and "auth_accounts"."store_id" is null)
        or ("auth_accounts"."role" in ('owner', 'operator') and "auth_accounts"."email" is not null and "auth_accounts"."email" = lower("auth_accounts"."email") and "auth_accounts"."store_id" is not null and "auth_accounts"."phone" is null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
	"bucket" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_account_id_auth_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_accounts_phone_unique" ON "auth_accounts" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_accounts_email_unique" ON "auth_accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_by_account" ON "auth_sessions" USING btree ("account_id");