CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_entity_valid" CHECK ("audit_events"."entity" in ('order', 'product', 'category', 'store')),
	CONSTRAINT "audit_action_valid" CHECK ("audit_events"."action" in ('created', 'updated', 'deleted', 'status_changed', 'items_changed')),
	CONSTRAINT "audit_actor_shape" CHECK (("audit_events"."actor_kind" = 'account' and "audit_events"."actor_id" is not null) or ("audit_events"."actor_kind" = 'system' and "audit_events"."actor_id" is null)),
	CONSTRAINT "audit_metadata_object" CHECK (jsonb_typeof("audit_events"."metadata") = 'object')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_by_store_recent" ON "audit_events" USING btree ("store_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_by_entity_recent" ON "audit_events" USING btree ("store_id","entity","entity_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
-- Reutiliza locks, CAS, cuota y snapshot T-10 sin alterar la función ni migración anteriores.
-- El customer procede del contexto autenticado del caso de uso; replay no inserta evento.
CREATE FUNCTION public.maui_commit_order_audited(
  p_customer text, p_store text, p_key text, p_fingerprint text, p_order jsonb,
  p_store_version integer, p_products jsonb, p_bucket text, p_limit integer, p_window integer,
  p_audit_id text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  result := public.maui_commit_order(p_customer, p_store, p_key, p_fingerprint, p_order,
    p_store_version, p_products, p_bucket, p_limit, p_window);
  IF result->>'kind' = 'created' THEN
    INSERT INTO public.audit_events (id, store_id, entity, entity_id, action, actor_kind, actor_id, metadata)
    VALUES (p_audit_id, p_store, 'order', p_order->>'id', 'created', 'account', p_customer,
      jsonb_build_object('version', 1, 'status', p_order->>'status', 'estimatedTotal', (p_order->>'estimatedTotal')::integer));
  END IF;
  RETURN result;
END $$;
