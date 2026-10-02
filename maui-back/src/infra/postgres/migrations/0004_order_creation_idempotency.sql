CREATE TABLE IF NOT EXISTS "order_creations" (
	"customer_id" text NOT NULL,
	"store_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"fingerprint" text NOT NULL,
	"order_id" text NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_creations" ADD CONSTRAINT "order_creations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_creations_identity" ON "order_creations" USING btree ("customer_id","store_id","key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_creations_order_unique" ON "order_creations" USING btree ("order_id");
--> statement-breakpoint
-- Una llamada SQL confirma claim + cuota + pedido, con locks durante toda la transacción.
-- SECURITY INVOKER: no eleva privilegios. Los snapshots originales sobreviven a cambios de estado.
CREATE FUNCTION public.maui_commit_order(
  p_customer text, p_store text, p_key text, p_fingerprint text, p_order jsonb,
  p_store_version integer, p_products jsonb, p_bucket text, p_limit integer, p_window integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  existing public.order_creations%ROWTYPE;
  current_version integer;
  product jsonb;
  attempts_count integer;
  start_at timestamptz;
  now_at timestamptz := (p_order->>'createdAt')::timestamptz;
BEGIN
  -- Serializa esta identidad incluso antes de que exista una fila; hash collision solo serializa.
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(p_customer,p_store,p_key)::text,0));
  SELECT * INTO existing FROM public.order_creations
    WHERE customer_id=p_customer AND store_id=p_store AND key_hash=p_key;
  IF FOUND THEN
    IF existing.fingerprint <> p_fingerprint THEN RETURN jsonb_build_object('kind','conflict'); END IF;
    RETURN jsonb_build_object('kind','replayed','creation',jsonb_build_object('fingerprint',existing.fingerprint,'order',existing.snapshot));
  END IF;
  IF p_order->>'customerId' IS DISTINCT FROM p_customer OR p_order->>'storeId' IS DISTINCT FROM p_store
     OR p_limit<>20 OR p_window<>3600 THEN RAISE EXCEPTION 'Invalid creation context'; END IF;
  -- La lectura de catálogo/tienda hecha por el caso de uso debe seguir vigente al confirmar.
  SELECT version INTO current_version FROM public.stores WHERE id=p_store FOR SHARE;
  IF NOT FOUND OR current_version<>p_store_version THEN RETURN jsonb_build_object('kind','changed'); END IF;
  FOR product IN SELECT value FROM jsonb_array_elements(p_products) ORDER BY value->>'id' LOOP
    SELECT version INTO current_version FROM public.catalog_products
      WHERE id=product->>'id' AND store_id=p_store AND active AND archived_at IS NULL AND in_stock FOR SHARE;
    IF NOT FOUND OR current_version<>(product->>'version')::integer THEN RETURN jsonb_build_object('kind','changed'); END IF;
  END LOOP;
  INSERT INTO public.auth_rate_limits AS rl (bucket,window_start,attempts) VALUES(p_bucket,now_at,1)
    ON CONFLICT(bucket) DO UPDATE SET
      attempts=CASE WHEN rl.window_start+make_interval(secs=>p_window)<=now_at THEN 1 ELSE LEAST(rl.attempts+1,p_limit+1) END,
      window_start=CASE WHEN rl.window_start+make_interval(secs=>p_window)<=now_at THEN now_at ELSE rl.window_start END
    RETURNING attempts,window_start INTO attempts_count,start_at;
  IF attempts_count>p_limit THEN RETURN jsonb_build_object('kind','limited','retryAfterSeconds',GREATEST(1,CEIL(EXTRACT(epoch FROM start_at+make_interval(secs=>p_window)-now_at))::integer)); END IF;
  INSERT INTO public.orders(id,store_id,customer_id,customer_name,customer_phone,items,total,status,delivery_mode,
    delivery_address,delivery_lat,delivery_lng,delivery_time_slot,substitution_preference,shipping_cost,created_at,updated_at)
  VALUES(p_order->>'id',p_store,p_customer,p_order->>'customerName',p_order->>'customerPhone',p_order->'items',
    (p_order->>'estimatedTotal')::integer,'received',p_order->>'deliveryType',p_order->'deliveryData'->>'address',
    (p_order->'deliveryData'->>'lat')::double precision,(p_order->'deliveryData'->>'lng')::double precision,
    p_order->'deliveryData'->>'timeSlot',p_order->>'substitutionPreference',(p_order->>'shippingCost')::integer,now_at,now_at);
  INSERT INTO public.order_creations(customer_id,store_id,key_hash,fingerprint,order_id,snapshot)
    VALUES(p_customer,p_store,p_key,p_fingerprint,p_order->>'id',p_order);
  RETURN jsonb_build_object('kind','created','creation',jsonb_build_object('fingerprint',p_fingerprint,'order',p_order));
END $$;
