# Future work

Ideas revisadas y aparcadas a la espera de una decisión. Cada una explica qué
hay hoy, qué faltaría y —lo importante— **qué hay que preguntar antes** de
ponerse, para no construir sobre un supuesto que la clínica no confirma.

---

## Buscar hueco desde «Nueva cita»

**Estado: propuesto, no implementado. Bloqueado por requisitos.**

La idea es el asistente de programación de Teams pero para un cliente: en vez
de proponer tú fecha y hora y que el sistema conteste sí o no, pedirle al
sistema «dame los próximos huecos libres para este servicio» y elegir de una
lista.

### Qué hay ya

Las piezas difíciles están construidas y probadas:

- `lib/schedule.ts` resuelve el horario efectivo de una fecha: centro (semanal
  + excepción + festivo) ∩ empleada (semanal + excepción + ausencia). Ya tiene
  variantes por rango de fechas (`getClinicWeekCells`, `getWorkerWeekCells`).
- `lib/availability.ts` → `validateAppointmentSlot()` valida un hueco concreto
  contra cuatro reglas: cabina ocupada, trabajadora ocupada, cliente que ya
  tiene otra cita a esa hora, y fuera de horario.
- `lib/actions.ts` → `checkAvailability()` es la comprobación en vivo que el
  panel de cita llama con un debounce de 400 ms para pintar los conflictos.
- `Appointment` tiene los índices `[clinicId, cabinId, startAt]` y
  `[clinicId, workerId, startAt]`, que son justo los que necesitaría una
  búsqueda por rango.

Todo esto es **reactivo**: valida un hueco que tú propones. No hay nada que
proponga huecos.

### Qué faltaría

1. **El buscador**: un `findAvailableSlots()` que recorra los días desde una
   fecha, reste las citas existentes al horario efectivo, cruce cabinas y
   trabajadoras libres y trocee el resultado en pasos de N minutos con la
   duración del servicio.
2. **Carga en bloque**: `getEffectiveWorkingHours()` hace 2–3 consultas por
   (trabajadora, día). Buscar en 30 días con 5 trabajadoras serían unas 450
   consultas. Hace falta una variante que precargue horarios semanales,
   excepciones, ausencias y festivos de todo el rango de golpe. Es el único
   trabajo técnico de verdad.
3. **Granularidad**: hoy `openNew()` en `components/agenda-board.tsx` solo
   propone horas en punto. Habría que decidir el paso de búsqueda (15 min es
   lo habitual) y si se permite empezar a hora rota.
4. **La interfaz**: botón «Buscar hueco» en el panel de nueva cita, listado de
   propuestas agrupadas por día, y que al pulsar una se rellenen fecha, hora,
   trabajadora y cabina.
5. **Tests** en `tests/schedule/`, siguiendo el patrón que ya hay allí.

### Preguntas a requisitos (esto es lo que bloquea)

Sin estas respuestas el buscador propondría huecos que en la práctica no
existen — resultados bonitos pero falsos, que es peor que no tener buscador.

- **¿Cada servicio se puede hacer en cualquier cabina?** Hoy el modelo no
  relaciona `Service` con `Cabin`, así que el sistema da por hecho que sí. Si
  hay tratamientos atados a una cabina concreta (láser, por ejemplo), hace
  falta esa relación antes de que el buscador pueda decir «cualquier cabina».
- **¿Cualquier trabajadora hace cualquier servicio?** Mismo caso: no existe
  relación `Service` ↔ `User`. Si hay tratamientos que solo hacen algunas
  personas, el modo «me da igual quién» propondría a quien no toca.
- **¿Hace falta margen entre citas?** Limpieza de cabina, preparación… Ahora
  mismo el concepto no existe: una cita puede empezar en el minuto en que
  acaba la anterior. Si se necesita, es un campo nuevo (por servicio o por
  clínica).

### Nota de alcance

Mientras las dos primeras preguntas sigan abiertas, una v1 **sí** sería
posible limitando la búsqueda a trabajadora y/o cabina ya elegidas (el
equivalente a «buscar sala» en Teams). Pero el modo que de verdad aporta valor
es el de «cualquiera me vale», y ése es exactamente el que depende de esos dos
datos. Por eso se aparca entera en vez de hacer media.

Al retomarlo: cortar la búsqueda en la hora actual cuando el rango incluya
hoy, para no proponer huecos ya pasados.

---

## Una tabla de cobros (`SalePayment`)

**Estado: propuesto, no implementado. Aparcado a propósito, no bloqueado.**

Hoy una venta tiene un solo `paymentMethod` y un solo `paidCents`, así que no
existe la idea de «cobro»: un segundo pago no puede hacer otra cosa que pisar
el primero. La tabla convertiría cada entrada de dinero en una fila con su
importe, su fecha, su método y su nombre.

### Qué hay hoy, y por qué

El 7 de septiembre de 2026 se arregló el caso que dolía. `payDebt` pedía el PIN
—«¿Quién está cobrando?»— y lo tiraba: `operator` no se volvía a usar en toda
la función. El dinero de una deuda entraba en la caja del día en que se cobra,
pero la venta seguía diciendo el nombre de quien la vendió, semanas antes. Si
al cerrar caja faltaba, no había a quién preguntar.

Se resolvió por la vía corta: `payDebt` **sobrescribe `sale.userId`** con quien
cobra. La columna «Cobró» del listado pasa a decir la verdad sin campos nuevos,
sin migración y sin tocar informes.

Tiene un precio consciente: deja de constar quién vendió y aceptó dejar a
deber. Se asumió porque quién hizo cada servicio no se pierde —eso vive en
`SaleLine.workerId`, que es la columna «Atendió»— y lo que se quiere saber de
una venta cobrada es quién tocó el dinero.

De paso, el ticket dejó de decir «Cobrado por X» y dice «Movimiento realizado
por X»: ese nombre ya no siempre es quien vendió, y «cobrado» prometía una
precisión que el dato no tiene.

### Qué queda sin resolver

Dos cosas, las dos de la misma raíz: `payDebt` también pisa el
`paymentMethod`, cambiando el `"DEBT"` por `"CASH"` o `"CARD"`.

1. **El mismo dinero cae en dos meses según qué pantalla mires.** Al saldar una
   deuda, la caja que sube es la del día del cobro, pero el informe de formas
   de cobro agrupa las ventas por `createdAt`. Una deuda de mayo cobrada en
   septiembre suma en la caja de septiembre y en el informe de mayo.
2. **Un mes cerrado deja de decir lo que decía.** Esa venta de mayo constaba
   como deuda; ahora consta como efectivo. Nada está congelado —los informes se
   recalculan siempre—, así que no hay dato corrupto: simplemente el mismo
   periodo contesta distinto según cuándo preguntes.

Ninguna de las dos rompe nada hoy. Aparecen solo con deudas que se cobran
bastante después, y en un centro donde se fía poco pueden no notarse nunca.

### Qué faltaría

```prisma
model SalePayment {
  id            String   @id @default(cuid())
  saleId        String
  sale          Sale     @relation(fields: [saleId], references: [id], onDelete: Cascade)
  amountCents   Int
  paymentMethod String   // CASH | CARD
  userId        String   // quien lo cobró, del PIN
  user          User     @relation(fields: [userId], references: [id])
  createdAt     DateTime @default(now())

  @@index([saleId])
  @@index([createdAt])   // los informes preguntan por periodo, no por venta
}
```

Y con ella:

1. `createSale` escribe la primera fila de cobro; `payDebt` escribe la segunda
   en vez de pisar la venta.
2. La caja del día pasa a poder derivarse de los cobros de esa fecha, en vez de
   mantener `totalCashCents` / `totalCardCents` a incrementos. Es lo que hace
   que caja e informe dejen de discrepar.
3. Los cuatro sitios que hoy leen `sale.paymentMethod` como «por dónde entró el
   dinero»: `lib/reports.ts` (`formasDeCobro`), `lib/reports-data.ts`,
   `app/(app)/reports/cobros/page.tsx` y `app/(app)/dashboard/page.tsx:78`.
4. **El relleno de lo que ya existe.** Es la parte delicada y el plan original
   ni la mencionaba: cada venta ya pagada necesita su fila retroactiva
   (`amountCents = paidCents`, método y usuario los actuales, `createdAt` el de
   la venta). Sin eso, los informes de meses pasados se quedan vacíos de golpe
   el día del despliegue.

Si se hace, `sale.userId` puede volver a ser quien vendió: el quién de cada
cobro ya vive en su fila.

### Decisiones a tomar antes

- **¿Qué cuenta como cobro?** El saldo del cliente ya se registra en
  `CustomerBalanceMovement`. Si `SalePayment` recoge también `BALANCE` y
  `GIFT_CARD`, ese dinero se cuenta dos veces. Lo razonable es que la tabla
  cubra solo lo que entra en caja y el saldo se quede donde está.
- **¿Qué queda en `sale.paymentMethod`?** Congelarlo en `"DEBT"` es lo
  coherente, pero obliga a derivar de los cobros la columna «Pago» del listado
  y su filtro. Dejarlo como está —el último método, denormalizado— y que la
  tabla alimente solo los informes cuesta la mitad y resuelve el 1 y el 2.
- **¿Se quieren pagos parciales?** La tabla los permite sola (hoy 50 €, el
  resto el jueves). Hoy `payDebt` salda el total de golpe. Abrir esa puerta es
  pantalla nueva.

### Por qué se aparca

Lo que arregla es un desajuste entre dos pantallas que solo aflora con deudas
cobradas meses más tarde. El problema que de verdad dolía —dinero sin nombre al
cuadrar la caja— ya está resuelto. Y el trabajo no está en el modelo, que es
media tarde: está en el relleno retroactivo y en tocar los informes, que es
justo lo que no conviene mover recién estabilizado el v1 en el centro.

Retomarlo cuando haya rodaje suficiente para saber si ese desajuste molesta de
verdad. Si molesta, empezar por la versión reducida (segunda decisión por lo
barato): resuelve los dos síntomas sin tocar el listado ni los filtros.

---

## Un `actualizar.cmd` que instale la versión nueva él solo

**Estado: propuesto, no implementado. No bloqueado: es trabajo, no dudas.**

Hoy actualizar el PC del centro es copiar carpetas a mano siguiendo una lista
escrita. Funciona porque hasta ahora lo ha hecho quien escribió la lista. La
idea es que el paquete nuevo traiga dentro un `.cmd` que haga la actualización
entera —copia de seguridad, sustitución de ficheros y migraciones— y que la
persona que está delante del PC solo tenga que descomprimir y hacer doble clic.

### Qué hay hoy

El procedimiento vive en [DEPLOY.md](DEPLOY.md) («Desplegar una actualización»)
e [INSTALAR.md](INSTALAR.md) («Actualizar a una versión nueva»), y es este:
parar el servicio, copiar `.next/`, `node_modules/`, `public/`, `prisma/` y
`server.js` encima de la instalación, **no tocar** `data/`, `backups/` ni
`.env`, aplicar migraciones si las hay, arrancar.

La separación en la que se apoya sí está bien hecha: el código y los datos
viven en carpetas distintas, así que sustituir uno sin tocar el otro es
posible. Lo que falta es que eso lo garantice el código en vez de la vista.

Dos cosas lo hacen más frágil de lo que parece:

- **El paquete lleva su propia `data/lucyerp.db` sembrada**
  (`scripts/build-release.mjs`, paso 4). Si alguien arrastra la carpeta entera
  encima de `C:\lucy-erp` en lugar de ir fichero por fichero, machaca la base
  de producción. Es el fallo más probable de todo el proceso y lo único que lo
  evita hoy es leer bien el paso 3.
- **El paquete no lleva la CLI de Prisma**, así que las migraciones no se
  pueden aplicar allí. Las dos salidas documentadas —traerse el `.db`, migrarlo
  en local y devolverlo, o llevar `node_modules/prisma` en un USB— son
  manuales y hay que acordarse de ellas justo cuando hay prisa.

### Qué faltaría

**1. Que el paquete se descomprima al lado, no encima.** El `.zip` se abre en
`C:\lucy-erp-v2` y nadie copia nada a mano. Es lo que quita de en medio el
riesgo de machacar `data/`.

**2. `deploy/actualizar.cmd`**, que va dentro del paquete nuevo y hace, por
orden y parándose al primer fallo:

1. Comprobar que existe `C:\lucy-erp\data\lucyerp.db`. Si no está, avisar y
   salir: esto es una actualización, no una instalación.
2. Parar el servicio (`net stop LucyERP`) o detectar que corre en una ventana
   suelta y pedir que se cierre.
3. Copia de seguridad fechada del `.db` en `backups\`, reutilizando lo que ya
   hace `copia-seguridad.cmd`. Si falla, no seguir.
4. Copiar sus `.next/`, `node_modules/`, `public/`, `prisma/` y `server.js`
   sobre la instalación. Nunca `data/`, `backups/` ni `.env`.
5. Aplicar las migraciones pendientes (punto 3).
6. Arrancar y decir claramente si ha ido bien o mal.

**3. Un aplicador de migraciones sin la CLI.** Es la única pieza con miga. Las
migraciones son SQL plano contra SQLite, y el `@prisma/client` que ya viaja en
el paquete sabe ejecutar SQL: leer `prisma/migrations/*/migration.sql`,
comparar con la tabla `_prisma_migrations` del `.db` del centro y ejecutar en
orden las que no estén.

El detalle que no se puede improvisar: esa tabla tiene `checksum` **NOT NULL**,
y Prisma guarda ahí el SHA-256 del fichero `migration.sql`. Si el aplicador
escribe filas con un checksum inventado, el día que ese `.db` vuelva al
desarrollo `prisma migrate deploy` lo dará por corrupto. Hay que calcularlo
igual que lo calcula Prisma, y rellenar también `started_at`, `finished_at` y
`applied_steps_count`.

**4. Que `build-release.mjs` deje de poner una base sembrada en `data/`.**
Renombrarla a `data/lucyerp.db.plantilla` y que el instalador de primera vez la
copie a su sitio. Así el paquete deja de contener un fichero capaz de borrar el
trabajo del centro.

**5. Versionar el paquete de verdad.** Hoy `VERSION` está escrito a mano en
`build-release.mjs` (`const VERSION = "v1"`) y no se mira en ningún sitio. Para
que el actualizador pueda decir «vas de la v1 a la v2» —y negarse a ir hacia
atrás— hace falta que la versión esté en el paquete y también en la
instalación.

### Decisiones a tomar antes

- **¿Un paquete o dos?** Instalar por primera vez y actualizar no son lo mismo,
  y mezclarlos es justo lo que hace peligroso el `.db` sembrado. Puede ser el
  mismo `.zip` con dos `.cmd` (`instalar.cmd` / `actualizar.cmd`), o dos
  paquetes distintos. Lo primero es más simple de construir; lo segundo, más
  difícil de usar mal.
- **¿Qué hace si el servicio no para?** NSSM a veces tarda, y copiar encima de
  un `node.exe` vivo falla a medias, que es el peor sitio donde quedarse.
  Esperar y reintentar, o abortar antes de tocar nada.
- **¿Y si las migraciones fallan a mitad?** SQLite no da DDL transaccional
  completo, así que no siempre se puede deshacer. La respuesta razonable es no
  intentar deshacer: parar, dejar el mensaje y decir que se restaure la copia
  del paso 3 (que por eso se hace antes que nada). Pero eso hay que decidirlo y
  escribirlo, no descubrirlo el día que pase.

### Por qué no está hecho ya

Porque hasta ahora ha habido una sola instalación y una sola persona
actualizándola, y con el manual delante sale bien. El trabajo se justifica
cuando actualice alguien que no escribió el manual, o cuando haya más de un
centro — ahí el coste de un despiste deja de ser teórico.

Es media jornada larga: el aplicador de migraciones y el reparto de
responsabilidades entre `build-release.mjs` y los `.cmd`. No depende de
requisitos de la clínica, así que se puede hacer en cualquier momento; solo
hay que querer gastarla.

---

## «He olvidado mi PIN» y «he olvidado mi contraseña»

**Estado: propuesto, no implementado. Sin bloqueos: se puede hacer ya.**

La aplicación es local, no manda correos y WhatsApp está apagado, así que el
típico «te enviamos un enlace» no existe. Y no hace falta: en un centro de
cuatro o cinco personas, quien puede restablecer un acceso es **otra persona
que está en el mismo local**. El diseño se apoya en eso.

### Qué hay hoy

- **PIN de una trabajadora.** Ya se puede resolver: Gestión → Personal → ficha →
  «Generar PIN» / «Generar uno nuevo» (`generateUserPin` en `lib/actions.ts`).
  El sistema elige uno
  libre, lo enseña una sola vez y nace con `mustChangePin`. Lo que falta es que
  **nadie lo sabe**: la pantalla del teclado no dice qué hacer si no te acuerdas.
- **PIN de una administradora.** Igual: entra por la gestión (con contraseña) y
  se lo genera ella misma, o lo hace otra.
- **Contraseña de la gestión.** No hay camino en la aplicación. `setUserPassword`
  deja a una administradora cambiar la de otra, pero **la escribe ella**, así
  que acaba siendo `lucia2026`. Y si la que la pierde es la única administradora,
  el centro se queda sin gestión: `DEPLOY.md` manda traerse el `.db` y tocar el
  hash a mano. Es lento, exige a quien desarrolla y obliga a mover la base de
  datos del cliente.

### Qué se propone, en tres capas

**1. Decir qué hacer (S).** Sin código de seguridad, solo textos:

- Teclado del mostrador: bajo los puntos, en pequeño, *«¿Has olvidado tu PIN?
  Pídele a una administradora que te genere uno nuevo.»*
- Mensaje de bloqueo («Demasiados intentos…»): añadir esa misma frase. Es donde
  más falta hace: quien no se acuerda sigue probando, y el contador es global
  (ver `lib/pin.ts`), así que **bloquea a todas**.
- Login de la gestión: *«¿Has olvidado la contraseña? Otra administradora puede
  restablecerla desde Personal.»*

**2. Restablecer entre administradoras, bien hecho (S–M).** La acción ya existe;
hay que quitarle las trampas:

- **La contraseña temporal la genera el sistema**, como el PIN, y se enseña una
  sola vez. Hoy la inventa la administradora. Letras y números sin los que se
  confunden (`0/O`, `1/l/I`), tres grupos de tres, por ejemplo `K7M-4PQ-9XT`.
  Nace con `mustChangePassword`.
- **Confirmar a quién.** El diálogo dice «Vas a cambiar la contraseña / el PIN
  de **Marta Gómez Ruiz**», con apellidos, para no resetear a la equivocada si
  hay dos Martas.
- **Que quede constancia** de que se enseñó: «Anótalo ahora, no se vuelve a
  mostrar. Si lo pierdes, genera otro.» Regenerar no cuesta nada, y eso quita la
  angustia de «no lo he apuntado».
- **Nunca quedarse sin administradora.** Comprobar que no se puede desactivar,
  rebajar de rol ni quitar la contraseña a la **última administradora activa**.
  Es el fallo humano más caro de todos y es una línea de validación.
- **Aviso permanente si solo hay una** administradora activa: banda en Personal,
  *«Solo hay una administradora. Si pierde su contraseña, habrá que recuperar el
  acceso a mano. Da de alta una segunda.»* Es la medida que más protege y no
  cuesta desarrollo: es una recomendación de instalación (poner a dos).

**3. Última red: recuperar desde el propio PC (M).** Para cuando la única
administradora no recuerda nada y no hay segunda. Un `recuperar-acceso.cmd` junto
a `iniciar-lucyerp.cmd` que llama a un script en JS plano (no `tsx`: el paquete
autónomo no lo lleva, ver `DEPLOY.md`). Lo que hace, pensado para no equivocarse:

1. **Hace copia del `.db`** antes de tocar nada (misma carpeta que
   `copia-seguridad.cmd`).
2. **Lista las administradoras activas numeradas** y se elige con un número: sin
   teclear correos, así no hay erratas.
3. Genera una contraseña temporal aleatoria, la **muestra una vez**, pone
   `mustChangePassword` y avisa de que cualquier sesión abierta de esa persona
   sigue viva hasta que caduque (60 min; el JWT no se puede revocar).
4. Lo apunta en el log del servicio.

La autorización es **tener acceso físico al PC y a su cuenta de Windows**. Es el
mismo nivel de confianza que ya tiene quien puede copiar el `.db`, y no abre
ninguna puerta nueva desde la red. Sustituye al «traerse el `.db`» de `DEPLOY.md`
y a la fila de `INSTALAR.md` que dice «hay que restablecerla desde el
desarrollo». Ambos textos hay que actualizarlos al hacerlo.

### Fallos humanos que esto tiene que aguantar

| Qué puede pasar | Cómo se evita |
|---|---|
| Se cierra el diálogo sin apuntar el PIN o la contraseña | Regenerar es gratis y lo dice el propio aviso |
| Se resetea a la persona equivocada (dos con el mismo nombre) | El diálogo muestra nombre y apellidos antes de confirmar |
| Alguien llama o escribe «soy Marta, ponme otro PIN» | No hay reset por teléfono ni mensaje: lo hace una administradora, **delante de la persona**. Regla para la Guía del mostrador, no código |
| Una persona teclea mal cinco veces y deja parado el mostrador | El mensaje de bloqueo dice qué hacer; el minuto no escala (ver `lib/pin.ts`) |
| Se dejan la temporal sin estrenar días | Personal ya marca «PIN por cambiar» / «Contraseña por cambiar»; no se añade caducidad en v1 |
| La única administradora pierde la contraseña | Capa 3, y la capa 2 avisa antes de que ocurra |
| Se desactiva a la última administradora sin querer | La validación de capa 2 lo impide |
| El `.db` queda mal al recuperar a mano | El script hace copia antes |

### Qué se descarta, y por qué

- **Enlace por correo o SMS.** No hay servicio de correo en el PC del centro y
  añadirlo es una dependencia externa para resolver algo que se arregla
  hablando con quien está al lado.
- **Código de recuperación impreso al instalar.** Se pierde, o lo ve quien no
  debe. Cambia «olvidé la contraseña» por «olvidé dónde está el papel».
- **Preguntas de seguridad.** Las respuestas se adivinan o se olvidan, y el
  PIN de seis dígitos que protege el cobro es más fuerte que eso.
- **Que la trabajadora restablezca su propio PIN.** Quien no recuerda el PIN no
  puede demostrar quién es sin la administradora; el PIN es lo único que
  identifica a quien cobra (ver `lib/operator.ts`).

### Decisiones a tomar antes

- **¿Cuántas administradoras habrá de verdad?** Si ya son dos, la capa 3 baja de
  prioridad (queda como red de último recurso, no como camino habitual).
- **¿Puede cualquier administradora restablecer el PIN de cualquiera,
  incluida otra administradora?** Es lo que hay hoy. Si no se quiere, hay que
  decidir quién puede con quién.
- **¿Se quiere dejar registro de quién restableció qué y cuándo?** Una tabla
  mínima (`AccessReset`: quién, a quién, PIN o contraseña, fecha) responde a
  «¿quién le dio ese PIN?» si un día se cobra a nombre de otra. Es opcional,
  media tarde, y no guarda ningún secreto.

### Hallazgo de paso

`loginAction` (contraseña de la gestión) **no tiene freno de fuerza bruta**; solo
lo tiene el PIN. Sin él, una contraseña de seis caracteres que escribió una
persona es el eslabón débil de toda la aplicación. Conviene meter el mismo
freno (cinco fallos, un minuto) en esta misma pasada, y de hecho es lo que hace
que la capa 2 sea seguro de ofrecer.

### Orden sugerido

Capa 1 (textos) + «nunca quedarse sin administradora» + freno del login: una
tarde, y ya se nota. Después la contraseña temporal generada y el aviso de
«solo hay una». La capa 3 al final, o antes si el centro arranca con una sola
administradora.

---

## Escribir la cantidad en la línea del ticket

**Estado: propuesto, no implementado. No bloquea nada, es de comodidad.**

### Qué hay hoy

Desde que se quitó la tarifa por minuto (B1) hay un servicio, «Epilación
eléctrica», que se cobra a mano con el precio del minuto como precio fijo
(2,35 €) y los minutos como cantidad: 8 minutos son una línea de 8 × 2,35 €.
En la línea del ticket la cantidad solo se cambia con los botones − y +
(`LineRow` en `components/sales-client.tsx`), así que 8 minutos son 7 clics y
20 minutos son 19.

### Qué haría falta

Que la cantidad del medio del stepper sea un campo numérico editable, con el
mismo patrón que ya usa el descuento de la misma fila: se escribe, se limita a
un mínimo de 1 y se guarda al vuelo. Sirve igual para productos (la clienta que
se lleva seis ampollas). Es solo pantalla: `createSale` ya recibe la cantidad y
recalcula los totales.

### Para decidir

- **¿Un tope?** Un `1000` por un dedo de más en el teclado pasaría sin que nadie
  lo viera. Un límite razonable (p. ej. 999) y un total bien visible bastan.
- **¿Es la solución definitiva a los servicios por minuto?** Si la clínica va a
  cobrar así más servicios, quizá compense un servicio «por tiempo» de verdad
  (precio por minuto y minutos que se teclean), que es justo lo que se quitó
  por estar roto. Mientras sea uno solo, el campo editable es suficiente.

---

## «Esta semana» en el informe de horas trabajadas

**Estado: propuesto, no implementado. Sin requisitos pendientes de la clínica.**

### Qué hay hoy

Informes > Actividad del centro > «Horas trabajadas y ausencias»
(`components/reports/jornadas.tsx`) usa el selector de período de todos los
informes: Este mes, Mes pasado, Trimestre, Año y Personalizado
(`PERIODOS` en `lib/reports.ts`). Para ver una semana hay que ir a
Personalizado y teclear las dos fechas, y para este informe la semana es
justo lo que se mira: quién trabaja cuántas horas y quién falta estos días.

### Qué haría falta

- Un período `semana` en `PeriodoId` y en `resolverPeriodo`: de lunes a domingo
  de la semana en curso, con la semana anterior como tramo de comparación
  (igual que el mes pasado lo es del mes). Ojo con el cambio de hora, que ya
  cuida `diasEntre`.
- Una pestaña «Esta semana» delante de «Este mes» en el selector, con su test
  en `tests/reports/periodo.test.ts` (un domingo, un lunes, el cambio de año).

### Para decidir

- **¿Solo en este informe o en todos?** El selector es común. Ponerlo en todos
  es lo más barato y no estorba, pero en los de ventas «esta semana» a media
  semana compara tres días contra siete de la anterior. En este informe no
  pasa, porque las horas son las del horario y cuentan también los días que
  aún no han llegado.
- **¿La semana empieza en lunes?** Es lo habitual aquí y lo que usa el resto de
  la aplicación; se deja dicho para no descubrirlo con un informe en domingo.

---

## Exportar informes para la propietaria

**Estado: por analizar, no implementado. Bloqueado por requisitos: primero hay que
saber qué quiere llevarse y para qué.**

### Qué hay hoy

Los once informes de Informes (`components/reports/indice.tsx`: facturación por
empleada, ingresos por familia, cobros y descuentos, evolución, gastos, clientes,
inactivos, deuda, saldo, ocupación y horas trabajadas) solo se leen en pantalla.
No hay botón de exportar, ni CSV, ni Excel, ni PDF, ni vista de impresión.

### Qué hay que averiguar antes de programar

Es una conversación con la propietaria, no una decisión técnica. Y conviene
hacerla con los informes delante, no en abstracto:

- **¿Para qué los exporta?** Para enseñárselos a la gestoría, para su propio
  control en una hoja de cálculo, para imprimirlos y archivarlos, para
  mandárselos a alguien. Cada uso pide un formato distinto.
- **¿Cuáles de los once?** Seguramente no todos. Candidatos naturales: facturación
  por empleada (para calcular incentivos a mano, que es como lo hace hoy), cobros
  y descuentos, deuda, y las ventas por línea. Lo que pase por la gestoría
  (cobros por forma de pago, IVA si llega a hacer falta) pesa más que lo demás.
- **¿Qué formato?**
  - CSV: lo más barato y lo abre cualquier hoja de cálculo, pero la propietaria
    probablemente espera «un Excel» que se abra sin pasos intermedios (cuidado
    con la codificación y el separador decimal en español: coma, y `;` como
    separador, o Excel lo abre todo en una columna).
  - XLSX: más trabajo y una dependencia nueva, pero abre bien y permite varias
    hojas y formato.
  - PDF o impresión: para archivar o enseñar. Más barato con una vista de
    impresión del navegador (como el ticket) que con un generador de PDF.
- **¿Qué trae el fichero?** Lo que se ve en pantalla (el resumen) o el detalle
  línea a línea. Para calcular incentivos, el detalle de cada empleada con sus
  servicios y precios; para la gestoría, el resumen por forma de pago.
- **¿Con qué filtros?** El período que está mirando, con los filtros que tenga
  puestos, o siempre el período entero. Lo segundo es más predecible; lo
  primero es lo que uno espera al pulsar el botón desde una pantalla filtrada.
- **¿Qué hacen las sesiones de bono?** En la actividad de la empleada hay un
  interruptor para sumarlas al total (apagado por defecto). El fichero tiene que
  decir cuál de los dos totales lleva, o llevar los dos, para que nadie compare
  la hoja con la pantalla y vea números distintos sin saber por qué.

### Qué haría falta, una vez claro

- Un botón «Exportar» en `InformeShell` (`components/reports/shared.tsx`), que es
  la cabecera común, y una función por informe que devuelva las filas ya
  calculadas: los datos salen de `lib/reports.ts` y no hay que recalcular nada,
  solo darles forma de tabla.
- El fichero se genera en el servidor (una ruta o una acción) con los mismos
  filtros que la pantalla, y se prueba como cualquier otra función de
  `lib/reports.ts`: es aritmética con formato, y es donde se cuela un céntimo
  de más o una fila repetida.
- Cuidar lo de siempre: los importes con coma decimal, las fechas legibles, el
  nombre del fichero con el período (`facturacion-empleadas-octubre-2026`), y que
  las empleadas dadas de baja sigan saliendo con su nombre.

### Orden sugerido

1. Sentarse con la propietaria y enseñarle los informes: marcar cuáles exportaría,
   para qué y qué esperaría abrir.
2. Hacer primero uno solo (el que más pida), en el formato que elija, y ver si le
   sirve antes de multiplicarlo por once.
3. Con ese patrón, añadir el resto con el mismo botón.
