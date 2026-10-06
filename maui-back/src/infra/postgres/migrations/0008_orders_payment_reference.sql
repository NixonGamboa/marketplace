-- ME-01/ME-04, aditiva: método de pago y referencia comercial por tienda. No edita migraciones aplicadas.
-- El migrador Neon HTTP ejecuta cada sentencia por separado, sin transacción común: cada una es atómica e
-- idempotente, así una migración interrumpida puede repetirse. Mientras corre, la versión anterior de la
-- API sigue creando pedidos: reciben `cash` por defecto y su número en el bloque bajo bloqueo o en el trigger.
CREATE TABLE IF NOT EXISTS "order_reference_counters" (
	"store_id" text PRIMARY KEY NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "order_reference_counters_positive" CHECK ("order_reference_counters"."last_value" >= 1)
);
--> statement-breakpoint
-- Pedidos anteriores: efectivo, el único medio que existía.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" text DEFAULT 'cash' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_payment_method_valid", ADD CONSTRAINT "orders_payment_method_valid" CHECK ("orders"."payment_method" in ('cash', 'qr', 'bre_b'));
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reference_number" integer;
--> statement-breakpoint
-- Asigna la referencia dentro del INSERT del pedido (misma transacción): el upsert bloquea la fila del
-- contador de la tienda hasta confirmar, así dos creaciones simultáneas nunca comparten número y un
-- rollback no consume ninguno. Una referencia explícita (restauración) solo adelanta el contador, que
-- nunca baja: un número borrado no se reutiliza. Una referencia ya asignada no cambia.
CREATE OR REPLACE FUNCTION public.maui_assign_order_reference() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.reference_number IS NOT NULL AND (NEW.reference_number IS DISTINCT FROM OLD.reference_number
       OR NEW.store_id IS DISTINCT FROM OLD.store_id) THEN
      RAISE EXCEPTION 'La referencia del pedido es inmutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.reference_number IS NULL THEN
    INSERT INTO public.order_reference_counters AS c (store_id, last_value) VALUES (NEW.store_id, 1)
      ON CONFLICT (store_id) DO UPDATE SET last_value = c.last_value + 1
      RETURNING c.last_value INTO NEW.reference_number;
  ELSE
    INSERT INTO public.order_reference_counters AS c (store_id, last_value) VALUES (NEW.store_id, NEW.reference_number)
      ON CONFLICT (store_id) DO UPDATE SET last_value = GREATEST(c.last_value, EXCLUDED.last_value);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- Un solo bloque (una transacción) bajo bloqueo de escritura de `orders`: numera una vez los pedidos sin
-- referencia por tienda y orden de creación (desempate por ID), después del mayor ya asignado, ajusta el
-- contador, activa el trigger y fija NOT NULL. Ningún INSERT concurrente queda entre numerar y el trigger.
DO $$
BEGIN
  LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
  WITH assigned AS (
    SELECT store_id, max(reference_number) AS last_value FROM public.orders GROUP BY store_id
  ), numbered AS (
    SELECT o.id, COALESCE(a.last_value, 0) + row_number() OVER (PARTITION BY o.store_id ORDER BY o.created_at, o.id) AS reference_number
    FROM public.orders o JOIN assigned a ON a.store_id = o.store_id
    WHERE o.reference_number IS NULL
  )
  UPDATE public.orders o SET reference_number = n.reference_number FROM numbered n WHERE o.id = n.id;
  INSERT INTO public.order_reference_counters AS c (store_id, last_value)
    SELECT store_id, max(reference_number) FROM public.orders GROUP BY store_id
    ON CONFLICT (store_id) DO UPDATE SET last_value = GREATEST(c.last_value, EXCLUDED.last_value);
  DROP TRIGGER IF EXISTS orders_assign_reference ON public.orders;
  CREATE TRIGGER orders_assign_reference BEFORE INSERT OR UPDATE OF reference_number, store_id ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.maui_assign_order_reference();
  ALTER TABLE public.orders ALTER COLUMN reference_number SET NOT NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_store_reference_unique" ON "orders" USING btree ("store_id","reference_number");
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_reference_positive", ADD CONSTRAINT "orders_reference_positive" CHECK ("orders"."reference_number" >= 1);
--> statement-breakpoint
-- Redefinición de la función T-10 (0004), misma firma: `maui_commit_order_audited` (0007) la sigue
-- llamando. Cambios: guarda `paymentMethod` (sin él, `cash`), y la creación y el reintento devuelven la
-- referencia y el método leídos del pedido. El snapshot de creación conserva la forma anterior (sin
-- método), legible también por la versión previa de la API si hubiera que revertir el código.
-- Límite 20 y ventana 3600 s duplican ORDER_CREATE_POLICY (orderAccess.ts), igual que en 0004.
CREATE OR REPLACE FUNCTION public.maui_commit_order(
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
  v_snapshot jsonb := p_order - 'paymentMethod';
  v_payment text := COALESCE(p_order->>'paymentMethod', 'cash');
  v_reference integer;
BEGIN
  -- Serializa esta identidad incluso antes de que exista una fila; hash collision solo serializa.
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(p_customer,p_store,p_key)::text,0));
  SELECT * INTO existing FROM public.order_creations
    WHERE customer_id=p_customer AND store_id=p_store AND key_hash=p_key;
  IF FOUND THEN
    IF existing.fingerprint <> p_fingerprint THEN RETURN jsonb_build_object('kind','conflict'); END IF;
    SELECT o.reference_number, o.payment_method INTO v_reference, v_payment FROM public.orders o WHERE o.id=existing.order_id;
    RETURN jsonb_build_object('kind','replayed','creation',jsonb_build_object('fingerprint',existing.fingerprint,
      'order',existing.snapshot,'reference',v_reference,'paymentMethod',v_payment));
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
  -- La referencia la asigna el trigger `orders_assign_reference` dentro de este INSERT.
  INSERT INTO public.orders(id,store_id,customer_id,customer_name,customer_phone,items,total,status,delivery_mode,
    delivery_address,delivery_lat,delivery_lng,delivery_time_slot,substitution_preference,shipping_cost,created_at,updated_at,payment_method)
  VALUES(p_order->>'id',p_store,p_customer,p_order->>'customerName',p_order->>'customerPhone',p_order->'items',
    (p_order->>'estimatedTotal')::integer,'received',p_order->>'deliveryType',p_order->'deliveryData'->>'address',
    (p_order->'deliveryData'->>'lat')::double precision,(p_order->'deliveryData'->>'lng')::double precision,
    p_order->'deliveryData'->>'timeSlot',p_order->>'substitutionPreference',(p_order->>'shippingCost')::integer,now_at,now_at,v_payment)
  RETURNING reference_number INTO v_reference;
  INSERT INTO public.order_creations(customer_id,store_id,key_hash,fingerprint,order_id,snapshot)
    VALUES(p_customer,p_store,p_key,p_fingerprint,p_order->>'id',v_snapshot);
  RETURN jsonb_build_object('kind','created','creation',jsonb_build_object('fingerprint',p_fingerprint,
    'order',v_snapshot,'reference',v_reference,'paymentMethod',v_payment));
END $$;
