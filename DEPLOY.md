# Despliegue LucyERP — Guía de referencia

App Next.js con SQLite desplegada localmente en el PC de la clínica.
Sin servidor externo, sin Docker. Los datos viven en `prisma/dev.db`.

---

## Setup inicial (una sola vez en el PC de la clínica)

### Prerrequisitos a preparar en tu máquina antes de ir

1. Añadir `output: 'standalone'` al `next.config.mjs`:
   ```js
   const nextConfig = {
     output: 'standalone',
     // ...resto de opciones
   }
   ```
2. Construir la app: `npm run build`
3. Descargar **Node.js** portable (zip, sin instalador) desde nodejs.org — extraer `node.exe`
4. Descargar **NSSM** desde nssm.cc — extraer `nssm.exe`
5. Preparar el fichero `.env` con las variables de entorno (ver sección de Variables)

### Carpeta que se copia al PC de la clínica

```
lucy-erp/
├── node.exe                  ← Node.js portátil
├── nssm.exe                  ← Para crear los servicios de Windows
├── .next/standalone/         ← Build autónomo (sin npm install)
├── .next/static/             ← Assets estáticos
├── public/                   ← Imágenes y recursos
├── prisma/                   ← Carpeta con dev.db (la base de datos)
├── scripts/reminder-worker.js ← Worker compilado
└── .env                      ← Variables de entorno
```

### En el PC de la clínica

6. Crear los dos servicios de Windows desde una terminal como Administrador:

   ```cmd
   nssm install LucyERP-Web node.exe C:\lucy-erp\.next\standalone\server.js
   nssm set LucyERP-Web AppDirectory C:\lucy-erp
   nssm set LucyERP-Web Start SERVICE_AUTO_START

   nssm install LucyERP-Worker node.exe C:\lucy-erp\scripts\reminder-worker.js
   nssm set LucyERP-Worker AppDirectory C:\lucy-erp
   nssm set LucyERP-Worker Start SERVICE_AUTO_START
   ```

   > El worker solo es necesario cuando WhatsApp esté activo. Se puede omitir hasta entonces.

7. Iniciar los servicios:
   ```cmd
   net start LucyERP-Web
   net start LucyERP-Worker
   ```

8. Crear acceso directo en el escritorio apuntando a `http://localhost:3000`

9. Verificar que la app arranca al encender el PC abriendo el navegador en `http://localhost:3000`

---

## Construir una nueva versión (en tu máquina de desarrollo)

```bash
npm run build
```

Carpetas que genera el build y hay que copiar en cada actualización:

```
.next/standalone/    ← el servidor autónomo
.next/static/        ← assets estáticos
public/              ← solo si hay cambios en imágenes o recursos
```

> La base de datos `prisma/dev.db` nunca se toca en una actualización.

---

## Desplegar una actualización en el PC de la clínica

1. Construir la nueva versión en tu máquina (`npm run build`)
2. Conectarte al PC de la clínica por **TeamViewer / AnyDesk**
3. Parar los servicios:
   ```cmd
   net stop LucyERP-Web
   net stop LucyERP-Worker
   ```
4. Reemplazar en el PC las carpetas `.next/standalone/` y `.next/static/`
5. Si hay **migraciones de base de datos** nuevas (cambios en `prisma/schema.prisma`), ejecutarlas:
   ```cmd
   node.exe node_modules\.bin\prisma migrate deploy
   ```
   > Hacer siempre backup del `dev.db` antes de aplicar migraciones (ver Backups).
6. Arrancar los servicios:
   ```cmd
   net start LucyERP-Web
   net start LucyERP-Worker
   ```
7. Abrir `http://localhost:3000` y verificar que todo funciona

---

## Backups de la base de datos

El único fichero con todos los datos es:

```
prisma/dev.db
```

- Copiar ese fichero periódicamente a un USB o carpeta en la nube (OneDrive, Google Drive)
- Hacer siempre backup previo antes de cualquier actualización con migraciones
- Para restaurar: parar los servicios, reemplazar el `dev.db`, arrancar los servicios

---

## Variables de entorno (`.env`)

El fichero `.env` debe estar en la raíz de la carpeta en el PC de la clínica:

```env
DATABASE_URL="file:./prisma/dev.db"

# WhatsApp Business Cloud API (dejar vacío hasta que se active)
WHATSAPP_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

Si `WHATSAPP_ACCESS_TOKEN` está vacío, el worker corre en **modo simulado** sin enviar mensajes reales.
El toggle de WhatsApp en Settings también debe estar activo para que el worker procese recordatorios.

---

## Activar recordatorios WhatsApp (cuando se decida)

1. Crear cuenta Meta Business verificada con el template `appointment_reminder_es` aprobado
2. Rellenar las variables de entorno de WhatsApp en el `.env` del PC de la clínica
3. Reiniciar el servicio `LucyERP-Worker`
4. Activar el toggle de WhatsApp en la pantalla de Settings de la app
