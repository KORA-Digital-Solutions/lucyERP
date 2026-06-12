# POC — Clínica Estética · Agenda por cabinas + WhatsApp

Aplicación **local monoclínica** (Fase 1) para gestionar la agenda diaria por
cabinas, clientes, servicios, trabajadores y **recordatorios automáticos por
WhatsApp Business API**. Basada en el documento *POC ERP Clínica Estética v1.1*.

## Stack

| Capa | Tecnología |
|---|---|
| App | Next.js 16 (App Router) + React 19 |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS v4 + shadcn/ui |
| ORM | Prisma |
| BBDD local | SQLite |
| WhatsApp | WhatsApp Business Cloud API |
| Worker | Node.js + `node-cron` |

> Nota: SQLite no soporta `enum` en Prisma, así que los campos de estado se
> modelan como `String` y se validan en `lib/enums.ts`.

## Paleta de color

`#3C54A4` · `#274775` · `#E5E9F7` · `#AFB9D9` · `#5F73B4` · `#F5F8FC` · `#FFFFFF`
(definida como variables CSS en `app/globals.css`).

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install            # o pnpm install

# 2. Crear la base de datos y generar el cliente Prisma
npx prisma migrate dev --name init     # crea prisma/dev.db
npm run db:seed                        # datos demo

# 3. Arrancar web + worker juntos
npm run start:local
```

O por separado:

```bash
npm run dev                # http://localhost:3000
npm run worker:reminders   # worker de recordatorios (otra terminal)
```

Datos demo: clínica "Clínica Estética Lucía", 3 cabinas, 4 trabajadores,
5 servicios, 5 clientes y 5 citas de hoy. La pantalla de login es simulada
(cualquier credencial entra al dashboard).

## Variables de entorno (`.env`)

```env
DATABASE_URL="file:./dev.db"
WHATSAPP_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=        # vacío => modo SIMULADO
WHATSAPP_WEBHOOK_VERIFY_TOKEN=local-dev-token
```

Si `WHATSAPP_ACCESS_TOKEN` está vacío, los envíos se registran como `SENT` en
**modo simulado** (sin llamar a Meta). Útil para desarrollar la agenda sin
credenciales reales.

## Estructura

```
app/
  (app)/agenda      → Agenda diaria por cabinas (pantalla principal)
  (app)/dashboard   → KPIs del día
  (app)/clients     → CRUD clientes
  (app)/services    → CRUD servicios
  (app)/workers     → CRUD trabajadores
  (app)/cabins      → CRUD cabinas
  (app)/settings    → Datos de clínica + configuración WhatsApp
  api/              → Endpoints (citas, cabinas, whatsapp, webhook)
lib/
  db.ts             → PrismaClient singleton
  actions.ts        → Server actions (mutaciones)
  availability.ts   → Control de solapamientos cabina/trabajador
  whatsapp.ts       → Cliente WhatsApp Cloud API (+ modo simulado)
  enums.ts          → Estados y metadatos de presentación
prisma/
  schema.prisma     → Modelo de datos Fase 1
  seed.ts           → Datos demo
scripts/
  reminder-worker.ts → Worker de recordatorios (cron */5 min)
```

## Funcionalidad cubierta (Fase 1)

- ✅ Configuración de clínica y horario.
- ✅ CRUD de cabinas, trabajadores, clientes y servicios.
- ✅ Crear / modificar / cancelar citas con cálculo automático de hora fin.
- ✅ Validación de solapamientos de **cabina** y **trabajador**.
- ✅ Agenda diaria con **columnas por cabina** y tarjetas por estado.
- ✅ Filtros por trabajador y estado · navegación por día.
- ✅ Envío de recordatorio WhatsApp (manual y automático por worker).
- ✅ Registro de mensajes y errores (`WhatsappMessage`).
- ✅ Webhook opcional (`/api/webhooks/whatsapp`) con `CONFIRMAR` / `CANCELAR`.

## Webhook local (opcional)

Para recibir confirmaciones por WhatsApp en local hace falta una URL pública:

```bash
ngrok http 3000
# Webhook: https://xxxx.ngrok-free.app/api/webhooks/whatsapp
# Verify token: el valor de WHATSAPP_WEBHOOK_VERIFY_TOKEN
```

## Fuera de alcance (Fase 2+)

Horarios/festivos/vacaciones, multi-sede, facturación Veri\*Factu, historia
clínica, stock y SaaS multi-tenant real. El modelo ya incluye `clinicId` en
todas las tablas para facilitar esa evolución.
