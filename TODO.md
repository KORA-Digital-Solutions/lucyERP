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
