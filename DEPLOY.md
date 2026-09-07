# Despliegue — lado del desarrollo

Cómo se construye el paquete que se lleva al PC del centro. Las instrucciones
que van **dentro** del paquete, las que sigue quien instala, están en
[INSTALAR.md](INSTALAR.md).

LucyERP se despliega en el PC de la clínica y ya: sin servidor externo, sin
Docker y sin internet. Los datos son un único fichero SQLite.

---

## Construir el paquete

```bash
npm run release
```

Hace `next build` (con `output: "standalone"`) y luego
`scripts/build-release.mjs`, que deja todo montado en `release/lucy-erp-v1/`:

```
release/lucy-erp-v1/
├── server.js                 ← servidor autónomo de Next
├── .next/  node_modules/  public/
├── prisma/                   ← esquema y migraciones (para actualizar la base)
├── data/lucyerp.db           ← base de datos ya creada y sembrada
├── .env                      ← DATABASE_URL + SESSION_SECRET nuevo
├── iniciar-lucyerp.cmd       ← arranque a mano
├── instalar-servicio.cmd     ← servicio de Windows (NSSM)
├── copia-seguridad.cmd       ← copia fechada de la base
└── INSTALAR.md
```

Son unos 190 MB. En el PC del centro solo hace falta **Node.js 20.9+**: las
dependencias van dentro, así que allí no se ejecuta `npm install` nunca.

Los `.cmd` no se generan: viven en `deploy/` y se copian tal cual. Si hay que
tocarlos, se tocan ahí.

Para llevárselo en un USB o mandarlo, comprimir la carpeta:

```powershell
Compress-Archive -Path release\lucy-erp-v1 -DestinationPath release\lucy-erp-v1.zip
```

### Lo que el script hace y conviene saber

- **El motor de Prisma.** Es un binario nativo (`query_engine-windows.dll.node`)
  y el trazado de Next se lo deja fuera a veces. El script comprueba que está y
  lo copia a mano si falta; si no puede, aborta. También tira las copias a
  medias (`…dll.node.tmp1234`) que deja `prisma generate` cuando el fichero
  estaba bloqueado por un `next dev` abierto: son 20 MB cada una.
- **La base de datos se crea aquí, no allí.** El script aplica las migraciones
  y ejecuta `prisma/seed-produccion.ts` contra el `.db` del paquete. Así en el
  centro no hace falta ni la CLI de Prisma.
- **El `SESSION_SECRET` se genera nuevo en cada paquete.** Firma las cookies de
  sesión, así que no puede ir escrito en el repositorio.

---

## La base de datos inicial

`prisma/seed-produccion.ts` (`npm run db:seed-prod`) es el seed del centro, no
el de demo. Deja lo justo para empezar a trabajar: el centro con su horario, la
administradora (Lucía Martínez), dos cabinas, seis servicios en cuatro
familias, dos productos sin existencias, dos bonos de ejemplo y los festivos.
**Ni clientes, ni citas, ni ventas, ni cajas.**

A diferencia de `prisma/seed.ts`, **no borra nada**: si la base ya tiene datos
se planta. Para empezar de cero hay que borrar el `.db` a mano.

Credenciales de arranque, las dos de un solo uso (la aplicación obliga a
cambiarlas al entrar por cada puerta):

```
Gestión del centro    lucia.martinez / lucia2026
Mostrador             PIN 100001
```

---

## Desplegar una actualización

1. `npm run release` en local.
2. Conectarse al PC del centro por TeamViewer / AnyDesk.
3. Hacer copia de seguridad allí (`copia-seguridad.cmd`) y **traérsela**.
4. Parar: `net stop LucyERP` (como administrador) o cerrar la ventana negra.
5. Sustituir `.next/`, `node_modules/`, `public/`, `prisma/` y `server.js`.
   **No tocar `data/`, `backups/` ni `.env`.**
6. Si hay migraciones nuevas, aplicarlas (ver abajo).
7. Arrancar: `net start LucyERP`.

### Migraciones en el PC del centro

El paquete no lleva la CLI de Prisma. Las opciones, de menos a más incómoda:

- **Traerse el `.db`**, aplicar las migraciones en local (`npx prisma migrate
  deploy` con `DATABASE_URL` apuntando a ese fichero), devolverlo y sustituirlo
  con el servicio parado. Es lo más seguro: si algo sale mal, el original sigue
  intacto en el centro.
- **Llevar `node_modules/prisma` y `node_modules/.bin`** en un USB y ejecutar
  `prisma migrate deploy` allí, con `DATABASE_URL` apuntando al `.db` del PC.

En cualquier caso: **copia de seguridad antes**, siempre.

---

## Restablecer la contraseña de la administradora

No hay recuperación desde la aplicación (es local y no manda correos). Si se
pierde: traerse el `.db`, actualizar el `passwordHash` con un `bcrypt.hash(…,
12)` y `mustChangePassword: true`, y devolverlo.

---

## WhatsApp

v1 sale con WhatsApp desactivado (`whatsappEnabled` a `false` y las variables
vacías) y **sin el worker de recordatorios**, que se ejecuta con `tsx` y no
entra en el paquete autónomo.

Para activarlo más adelante hacen falta las tres cosas: cuenta de Meta Business
verificada con la plantilla `appointment_reminder_es` aprobada, las variables
`WHATSAPP_*` en el `.env` del centro, y una forma de correr
`scripts/reminder-worker.ts` allí (segundo servicio de NSSM, con Node y el
proyecto completo, o compilándolo antes a un único `.js`).

Sin `WHATSAPP_ACCESS_TOKEN` el worker corre en modo simulado: registra los
mensajes como enviados sin llamar a Meta.
