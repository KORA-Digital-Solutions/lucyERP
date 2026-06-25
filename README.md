# LucyERP — Clínica Estética

ERP local para clínicas estéticas. Gestiona agenda por cabinas, clientes, ventas, stock y caja, con recordatorios automáticos por WhatsApp.

## Stack

| Capa | Tecnología |
|---|---|
| App | Next.js 16 (App Router) + React 19 |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS v4 + shadcn/ui |
| ORM | Prisma |
| BBDD | SQLite (`prisma/dev.db`) |
| WhatsApp | WhatsApp Business Cloud API |
| Worker | Node.js + `node-cron` |

## Puesta en marcha (desarrollo)

```bash
npm install
npx prisma migrate dev
npm run db:seed        # datos demo
npm run start:local    # web + worker juntos
```

O por separado:

```bash
npm run dev                # http://localhost:3000
npm run worker:reminders   # worker de recordatorios (otra terminal)
```

## Variables de entorno (`.env`)

```env
DATABASE_URL="file:./prisma/dev.db"

# WhatsApp — dejar vacío para modo simulado (no llama a Meta)
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_API_VERSION=v21.0
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

## Funcionalidad

- **Agenda** — vista diaria por cabinas, crear/editar/cancelar citas, validación de solapamientos de cabina y trabajador
- **Clientes** — CRUD con saldo/monedero (gift cards, deuda), historial de movimientos, alerta de inactividad
- **Ventas** — TPV con líneas de servicio y producto, métodos de pago, descuentos, deuda parcial
- **Caja** — apertura y cierre diario con desglose de billetes y cuadre
- **Stock** — productos, proveedores, movimientos de entrada/consumo/venta, alertas de mínimo
- **Servicios, trabajadores y cabinas** — CRUD completo con configuración por defecto
- **WhatsApp** — recordatorios automáticos (worker cada 5 min) y envío manual por cita. Modo simulado si no hay credenciales. Activar con el toggle en Settings
- **Settings** — datos de clínica, horario, configuración de recordatorios

## Estructura

```
app/
  (auth)/            → Login y cambio de contraseña
  (app)/dashboard    → KPIs del día
  (app)/appointments → Agenda por cabinas
  (app)/sales        → TPV y listado de ventas
  (app)/cash-register → Caja diaria
  (app)/stock        → Gestión de stock
  (app)/services     → CRUD servicios
  (app)/workers      → CRUD trabajadores
  (app)/cabins       → CRUD cabinas
  (app)/settings     → Configuración de clínica
  api/               → Endpoints REST
lib/
  db.ts              → PrismaClient singleton
  actions.ts         → Server actions
  whatsapp.ts        → Cliente WhatsApp Cloud API
  enums.ts           → Estados y metadatos
prisma/
  schema.prisma      → Modelo de datos
  seed.ts            → Datos demo
scripts/
  reminder-worker.ts → Worker de recordatorios (cron */5 min)
```

## Despliegue en el PC de la clínica

Ver [DEPLOY.md](DEPLOY.md).
