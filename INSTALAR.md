# LucyERP v1 — Instalación en el PC del centro

Esta carpeta es la aplicación entera: el programa, la base de datos y todo lo
que necesita para funcionar. **No hace falta internet, ni servidor, ni instalar
nada más que Node.js.** Los datos se quedan en este PC.

Tiempo estimado: 15 minutos.

---

## Antes de empezar

| Necesitas | Dónde |
|---|---|
| Un PC con Windows 10 u 11 | El del mostrador |
| **Node.js 20.9 o superior** (recomendado: 22 LTS) | https://nodejs.org — botón "LTS", instalador `.msi` |
| Esta carpeta (`lucy-erp-v1`) | En un USB o comprimida |
| *(Opcional)* `nssm.exe` | https://nssm.cc — solo para que arranque solo al encender |

> Si el PC no puede instalar programas, sirve también Node.js en versión
> portable (el `.zip` de nodejs.org): descomprímelo y deja la carpeta con
> `node.exe` dentro de `lucy-erp\node\`. Los `.cmd` de arranque la usan sola si
> la encuentran.

---

## Paso 1 — Instalar Node.js

1. Entra en https://nodejs.org y descarga la versión **LTS** para Windows (`.msi`).
2. Ejecuta el instalador y acepta todo tal cual viene (Siguiente → Siguiente → Instalar).
3. Para comprobar que ha ido bien, abre el menú Inicio, escribe `cmd`, ábrelo y teclea:

   ```
   node -v
   ```

   Tiene que responder algo como `v22.x.x`. Si dice que no reconoce el comando,
   cierra esa ventana, abre otra y repite (el instalador necesita una ventana
   nueva).

---

## Paso 2 — Copiar la aplicación

Copia la carpeta `lucy-erp-v1` entera al disco del PC, en:

```
C:\lucy-erp
```

Es decir: dentro de `C:\lucy-erp` tienen que quedar directamente `server.js`,
`iniciar-lucyerp.cmd`, la carpeta `data\`, etc. — no una carpeta dentro de otra.

Vale cualquier otra ruta (`D:\lucy-erp`, `C:\Users\...\lucy-erp`): los `.cmd`
calculan solos dónde están, así que no hay que cambiar nada. Pero **dos sitios
donde NO ponerla**:

- **`Archivos de programa` / `Program Files`.** La aplicación escribe su base de
  datos dentro de su propia carpeta, y ahí Windows no deja escribir a un usuario
  normal: arrancaría, y fallaría al guardar la primera cita.
- **Una carpeta sincronizada con OneDrive, Google Drive o Dropbox.** Sincronizar
  la base de datos mientras está en uso la corrompe. Las copias de seguridad sí
  van a la nube; la base en uso, no.

> Si prefieres arrancar sin los `.cmd` (con `node server.js` a pelo), entonces sí
> hay que abrir el fichero `.env` con el Bloc de notas y poner la ruta real en la
> línea `DATABASE_URL`.

---

## Paso 3 — Arrancar y comprobar que va

1. Doble clic en **`iniciar-lucyerp.cmd`**.
2. Se abre una ventana negra que dice que está arrancando. **No la cierres.**
3. Abre el navegador (Chrome o Edge) en:

   ```
   http://localhost:3000
   ```

4. Tiene que salir la pantalla del teclado numérico con el nombre del centro.

Si sale, la instalación está bien. Cierra la ventana negra por ahora: en el
paso siguiente se configura para que arranque sola.

---

## Paso 4 — Que arranque sola al encender el PC

Hay dos formas. La primera es la buena; la segunda es la fácil.

### Opción A (recomendada) — Servicio de Windows con NSSM

Así la aplicación arranca con el PC aunque nadie inicie sesión, y se levanta
sola si se cae.

1. Descarga NSSM de https://nssm.cc/download, descomprime, y copia el
   `nssm.exe` de la carpeta `win64` a `C:\lucy-erp\`.
2. Clic derecho sobre **`instalar-servicio.cmd`** → **Ejecutar como administrador**.
3. Cuando termine, abre `http://localhost:3000` para comprobarlo.

A partir de ahí, para pararlo o arrancarlo a mano, desde un `cmd` **como
administrador**:

```
net stop LucyERP
net start LucyERP
```

### Opción B — Tarea programada al iniciar sesión

Sin descargar nada, pero la aplicación no arranca hasta que alguien inicia
sesión en Windows.

1. Menú Inicio → escribe `Programador de tareas` → ábrelo.
2. **Crear tarea básica…** → Nombre: `LucyERP`.
3. Desencadenador: **Al iniciar sesión**.
4. Acción: **Iniciar un programa** → Examinar → `C:\lucy-erp\iniciar-lucyerp.cmd`.
5. Finalizar.

---

## Paso 5 — Acceso directo en el escritorio

Para que quien esté en el mostrador no tenga que escribir la dirección:

1. Clic derecho en el escritorio → **Nuevo** → **Acceso directo**.
2. Escribe: `http://localhost:3000`
3. Nombre: **LucyERP**.

Se puede también anclar esa pestaña a la barra de tareas desde Chrome
(⋮ → Guardar y compartir → Crear acceso directo…).

---

## Paso 6 — Primer arranque: las contraseñas

La aplicación tiene **dos puertas** y se entra distinto por cada una:

| Puerta | Para qué | Cómo se entra |
|---|---|---|
| **Mostrador** | El día a día: agenda, clientes, TPV, caja, stock | Tecleando un **PIN de 6 dígitos** |
| **Gestión del centro** | Usuarios, catálogo, horarios, configuración e informes | **Usuario y contraseña** |

La base de datos viene con **una sola usuaria**, Lucía Martínez
(administradora), y con estas credenciales **de un solo uso**:

```
Gestión del centro    usuario:     lucia.martinez
                      contraseña:  lucia2026

Mostrador             PIN:         100001
```

La aplicación obliga a cambiar las dos la primera vez que se entra por cada
puerta, así que **hay que hacer esto el primer día, delante del PC**:

1. Abre `http://localhost:3000`, pulsa en entrar a la **gestión del centro**,
   usuario `lucia.martinez` y contraseña `lucia2026`. Te pedirá una contraseña
   nueva: ponla y apúntala en sitio seguro.
2. Sal, y en la pantalla del teclado numérico teclea el PIN `100001`. Te lo
   volverá a pedir una vez (para saber a quién le está cambiando el PIN) y
   después te dejará elegir uno propio de 6 dígitos.

> Los dos valores de arriba dejan de servir en cuanto se cambian. Hasta que se
> cambien, cualquiera que los conozca puede entrar: hazlo el primer día.

---

## Paso 7 — Dejar el centro configurado

Todo esto se hace desde la aplicación, entrando por **gestión del centro**:

1. **Configuración** — nombre del centro, eslogan, CIF, dirección, teléfono y
   correo. Es lo que se ve en la pantalla de inicio.
2. **Usuarios** — dar de alta a las empleadas. Al crear cada una, la aplicación
   genera su PIN: apúntalo y dáselo, que ella se pondrá el suyo al entrar.
3. **Horarios** — horario semanal del centro (viene puesto de lunes a viernes,
   de 9:00 a 20:00) y el de cada empleada.
4. **Servicios** — repasar el catálogo de arranque: precios, duraciones y los
   que falten.
5. **Cabinas** — vienen dos ("Cabina 1" y "Cabina 2"): renómbralas o añade más.
6. **Bonos** — hay dos de ejemplo. Ajusta sesiones y descuentos, o bórralos.
7. **Stock** — dar de alta los productos y meter las existencias con un
   movimiento de entrada (así queda apuntado de dónde salieron).

### Qué trae la base de datos de fábrica

| | |
|---|---|
| Centro | 1, con horario de lunes a viernes 9:00-20:00 |
| Usuarias | 1 (Lucía Martínez, administradora) |
| Cabinas | 2 |
| Servicios | 6, en 4 familias (Facial, Depilación, Corporal, Manos y pies) |
| Productos | 2, sin existencias |
| Bonos | 2 de ejemplo |
| Festivos | Calendario laboral de Albacete |
| Clientes, citas, ventas y cajas | **Ninguno**: empieza en blanco |

---

## Copias de seguridad — esto es lo importante

**Todos los datos del centro están en un único fichero:**

```
C:\lucy-erp\data\lucyerp.db
```

Si se pierde ese fichero, se pierde todo: clientes, historial, ventas y caja.

- Doble clic en **`copia-seguridad.cmd`** hace una copia fechada en
  `C:\lucy-erp\backups\`. Hazlo al menos **una vez por semana**.
- Esa copia está en el mismo disco, así que **no sirve si el disco falla**:
  lleva de vez en cuando el fichero a un USB, a OneDrive o a Google Drive.
- Para restaurar: parar la aplicación, sustituir `data\lucyerp.db` por la copia
  y volver a arrancar.

---

## Actualizar a una versión nueva

Cuando llegue una carpeta `lucy-erp-v2` (o la que sea):

1. **Haz una copia de seguridad** (`copia-seguridad.cmd`) y guárdala fuera del PC.
2. Para la aplicación: `net stop LucyERP` como administrador, o cierra la
   ventana negra.
3. En `C:\lucy-erp`, **borra** las carpetas `.next`, `node_modules`, `public` y
   el fichero `server.js`, y copia en su lugar los de la versión nueva.
4. **No toques `data\`, `backups\` ni `.env`**: ahí están los datos del centro
   y la configuración de esta instalación.
5. Si la versión nueva trae cambios en la base de datos, vendrán con sus
   instrucciones: normalmente basta con seguirlas al pie de la letra antes de
   arrancar.
6. Arranca: `net start LucyERP` o doble clic en `iniciar-lucyerp.cmd`.

---

## Si algo va mal

| Qué pasa | Qué hacer |
|---|---|
| El navegador dice "no se puede acceder a este sitio" | La aplicación no está arrancada. Doble clic en `iniciar-lucyerp.cmd`, o `net start LucyERP`. |
| La ventana negra se cierra sola al abrirla | Node.js no está instalado o no está en el PATH. Repite el paso 1 y abre una ventana nueva. |
| `Error: listen EADDRINUSE :::3000` | Ya hay una copia arrancada (o el servicio). Con una basta. |
| Sale un error de `SESSION_SECRET` | Falta el fichero `.env` en `C:\lucy-erp`. Cópialo del paquete original. |
| Sale un error de base de datos | Comprueba que existe `C:\lucy-erp\data\lucyerp.db` y que la ruta del `.env` apunta ahí. |
| Se me ha olvidado la contraseña de la gestión | No se puede recuperar desde la aplicación: hay que restablecerla desde el desarrollo. |
| El servicio está instalado y quiero quitarlo | Como administrador: `net stop LucyERP` y luego `nssm.exe remove LucyERP confirm`. |

**Dónde mirar cuando algo falla:** si está instalado como servicio, el registro
está en `C:\lucy-erp\logs\lucyerp.log`.

---

## Lo que v1 **no** trae

- **Recordatorios automáticos por WhatsApp.** El envío está desactivado
  (`whatsappEnabled` en `false`) y el proceso que los manda no se instala en
  esta versión. Se activa más adelante, con la cuenta de Meta Business y la
  plantilla ya aprobadas.
- **Acceso desde otros equipos o desde el móvil.** La aplicación solo escucha
  en este PC (`127.0.0.1`), a propósito: así no queda expuesta en la red del
  centro. Abrirla a la red es un cambio pequeño, pero pide antes decidir cómo
  se protege.
