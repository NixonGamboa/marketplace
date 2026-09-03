# ADR-001 — Vercel + Postgres como stack inicial (sustituye AWS SAM del Sprint 1)

> **Estado:** `Accepted`
> **Fecha:** 2026-09-03
> **Autor:** Nixon Gamboa (Owner)
> **Supersede:** decisión de stack de Sprint 1 en `docs/demo-maui-pwa-rfc.md` §1.1
> **Aplica a:** todo el backend real de MAUI hasta que el negocio justifique migrar

---

## 1. Contexto

El `demo-maui-pwa-rfc.md` (aprobado 2026-06-02) definía el backend de Sprint 1 como **AWS SAM + Lambda + DynamoDB + WhatsApp Gateway**. La decisión se tomó antes de evaluar la fricción operativa y financiera real de arrancar en AWS, y antes de considerar alternativas equivalentes con menor costo de arranque.

Al pasar a la fase de scaffold del backend (septiembre 2026), se hizo un análisis comparativo entre continuar con AWS SAM o pivotar a un stack serverless equivalente en Vercel + Postgres administrado.

### Hallazgos que motivan el cambio

- **AWS obliga a registrar tarjeta de crédito** para crear cuenta, con cobro de verificación (~1 USD). Fricción de arranque real para un proyecto pre-revenue.
- **Riesgo de facturación descontrolada:** bugs, scrapers o loops accidentales pueden generar facturas de USD 200–500 sin alarma. Requiere disciplina de billing alarms desde el día 1.
- **API Gateway sale del Free Tier a los 12 meses** (~3.50 USD/M requests) — coste bajo pero recurrente.
- **DynamoDB introduce lock-in** en modelo de datos (single-table design, access patterns rígidos) que aún no está validado para MAUI.
- **Vercel Hobby es gratuito y sin tarjeta**, permite deploy automático por push a rama, y sirve el frontend estático + Vercel Functions en un solo dominio (cero CORS, cero infra).
- **Neon.tech / Supabase** dan Postgres serverless sin tarjeta, con free tier real (0.5 GB, autoscaling, hibernación).
- **La restricción "non-commercial" de Vercel Hobby** no bloquea la Fase 2 del RFC (validación con usuarios de Dolores) y el upgrade a Pro son USD 20/mes cuando aplique.
- **La portabilidad futura a AWS Lambda + DynamoDB sigue disponible** con costo de migración acotado si se respeta el layout de handlers portables (ver §4).

---

## 2. Decisión

**Adoptar Vercel Functions + Postgres administrado (Neon) como stack inicial del backend real** para el Sprint 1 y siguientes, hasta que el negocio (volumen, ingresos, requisitos operativos) justifique migrar a infraestructura propia en AWS.

### Stack específico

| Componente | Elección | Alternativa considerada |
|---|---|---|
| Runtime | Vercel Functions (Node 20, Edge donde aplique) | AWS Lambda |
| BD | Neon Postgres (HTTP driver) | DynamoDB, Supabase, PlanetScale |
| Query builder | Drizzle ORM | Prisma, Kysely, SQL crudo |
| Auth | Vercel Functions + JWT propio o Clerk/Supabase Auth | AWS Cognito |
| Storage de imágenes | Vercel Blob o Cloudinary free tier | S3 + CloudFront |
| Deploy | Push a rama en GitHub → auto-deploy | AWS SAM + GitHub Actions |
| Observabilidad | Vercel Analytics + Sentry free tier + logs Vercel | CloudWatch |
| WhatsApp Gateway | Evolution API en VPS (sin cambio) | AWS-hosted |

---

## 3. Consecuencias

### Positivas
- **Cero fricción de arranque:** sin tarjeta, sin cuenta AWS, sin IaC inicial.
- **Cero costo estimado en el primer año** (Vercel Hobby + Neon Free + Sentry Free).
- **Ergonomía de deploy 10x mejor:** push a rama = producción, sin CloudFormation ni SAM.
- **Frontend y backend en el mismo origin** → cero CORS, cero rewrites complejos.
- **Postgres es más flexible que DynamoDB** para iterar el modelo de datos durante la fase de descubrimiento.
- **Portabilidad a AWS Lambda mantenida** si se respeta el layout de §4.

### Negativas / trade-offs
- **Restricción "non-commercial" del Hobby** obliga a upgrade a Pro (USD 20/mes) cuando MAUI opere comercialmente de forma recurrente.
- **Vercel Functions no sirve para WebSockets estables ni jobs largos** — cuando aparezcan esos requisitos, hay que agregar un servicio complementario o migrar.
- **Cambio de decisión respecto al RFC aprobado** — se documenta aquí como source of truth; las menciones antiguas a "AWS SAM + Lambda + DynamoDB" en docs previos ahora apuntan a este ADR.
- **Neon tiene cold starts** en el plan free (compute hiberna). Aceptable para MVP.

---

## 4. Cómo se preserva la portabilidad futura a AWS

Regla dura: **la lógica de negocio no conoce ni el runtime (Vercel/Lambda) ni la BD (Postgres/DynamoDB).**

### Layout obligatorio del backend

```
maui-back/
├── api/                       # Adaptadores Vercel Functions (handler delgado, ~15 líneas c/u)
├── src/
│   ├── domain/                # Entities + interfaces Repository (contratos)
│   ├── usecases/              # Lógica pura de negocio, sin AWS ni HTTP
│   ├── infra/
│   │   ├── postgres/          # Adapter Repository sobre Neon (día 1)
│   │   ├── dynamodb/          # Adapter Repository sobre DynamoDB (día N)
│   │   └── memory/            # Adapter in-memory para tests
│   └── shared/                # zod, pino logger, config
└── tests/
```

### Reglas para que Postgres → DynamoDB sea barato después
1. **Nada de JOINs entre 3+ tablas.** Cada usecase pide su entidad por PK o por índice.
2. **Nada de foreign keys con cascadas.** DynamoDB no las tiene; relaciones a nivel aplicación.
3. **Nada de transacciones cross-tabla complejas.** DynamoDB `TransactWriteItems` tiene máximo 100 items.
4. **Diseñar access patterns primero.** Cada tabla se justifica con la lista de queries que soporta.
5. **IDs = NanoID/ULID**, nunca `SERIAL`. ULID da orden temporal gratis.
6. **Timestamps = ISO strings**, no `TIMESTAMP` PG. Portables directo.
7. **JSONB para atributos flexibles** — mapea a `Map` de DynamoDB sin fricción.
8. **Query builder = Drizzle o Kysely**, nunca Prisma. Salen sin drama a Dynamo.

### Cómo se hace la migración cuando llegue el día
1. Escribir `infra/dynamodb/*Repository.ts` implementando las mismas interfaces del `domain/`.
2. Ajustar la factory que decide qué adapter instanciar (`process.env.DB_DRIVER`).
3. Migrar datos entidad por entidad (puede ser gradual: `orders` en Dynamo, `catalog` sigue en Postgres 3 meses más).
4. Escribir `template.yaml` (SAM) o CDK con los Lambdas + API Gateway.
5. `handlers-lambda/` reemplaza a `api/` (mismos usecases, adapter diferente).
6. Los tests siguen corriendo contra `memory/` sin cambios.

Costo estimado de la migración con el layout respetado: **1–2 semanas de un ingeniero**, no un rewrite.

---

## 5. Criterios para reactivar la migración a AWS

Cualquiera de estos gatillos amerita reevaluar:

- Volumen mensual > 500K invocaciones y factura Vercel Pro + provider Postgres > USD 200/mes.
- Necesidad de WebSockets estables (tracker de pedido en tiempo real).
- Necesidad de jobs largos (>10 min) o workers.
- Requisito de compliance que fuerce single-tenant / VPC propia.
- 2+ aliados activos generando volumen sostenido (activación del roadmap v3).

---

## 6. Referencias

- `docs/demo-maui-pwa-rfc.md` (RFC original, decisión superada por este ADR)
- `docs/rq-PO-admin-panel-fase0.md` (análisis PO, referencias a Cognito superadas)
- `tech/features/20260602-demo-maui-pwa/1-functional/spec.md` (feature demo, referencia a AWS SAM superada)
- Vercel Functions: https://vercel.com/docs/functions
- Neon Postgres: https://neon.tech/docs
- Drizzle ORM: https://orm.drizzle.team
