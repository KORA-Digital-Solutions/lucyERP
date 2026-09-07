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
