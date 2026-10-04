# Plan de acción — revisión con stakeholder (notas de octubre 2026)

Notas en sucio puestas en limpio y contrastadas con el código. Cada ítem lleva
**as-is** (lo que hay hoy, verificado), **to-be** (lo pedido) y una estimación
orientativa: S (< ½ día), M (1–2 días), L (3–5 días), XL (> 1 semana).

Los puntos marcados `[x]` en las notas (PIN por empleada, informe de actividad,
líneas duplicadas en venta, cobro de deuda, buscador por tlf, cubo en agenda,
cliente minimal en cita, ordenación en 4 tablas, protección por roles, tarjeta
de confirmadas, how-to de despliegue) ya están hechos y no se repiten aquí.

---

## 0. Decisiones que cambian el alcance (resolver antes de programar)

| # | Decisión | Por qué bloquea |
|---|---|---|
| D1 | **Quitar la tarifa por minuto** del todo (solo precio fijo) o arreglarla. | Hoy está rota en TPV (ver B1). Quitarla simplifica, pero hay que migrar los servicios `PER_MINUTE` existentes a un precio fijo. La nota dice "al final tú pones el precio por minuto": propuesta = **quitar**. |
| D2 | **Precio de la sesión de bono en la línea de venta.** Hoy entra a 0 € con 0 % dto y no cuenta en el informe de empleadas (solo suma SERVICE y PRODUCT). Ejemplo: láser 60 € catálogo, bono 5 sesiones −20 % = 240 €, precio bono/sesión 48 €. Opción **A** (recomendada, es lo que pide la nota): línea a 48 € con dto 100 %, las 5 sesiones suman lo que entró por el bono. Opción B: 60 € con dto 100 %, infla (300 € por un bono de 240 €). | Impactos de A: columna aparte "sesiones de bono" en informe de empleadas (no sumar al total, para no contar dos veces el bono); excluir VOUCHER_SESSION del cálculo de `discountCents` (si no, dispara "Descuentos" en ticket e informe de cobros); redondeo céntimos (250/3); bono con precio editado en mostrador (precio/sesión sale de la plantilla, no de lo cobrado); script de relleno retroactivo factible (cada sesión conoce su bono y éste guarda base y dto). Est. M + S retro. |
| D3 | **Pagos mixtos (50 € efectivo + resto tarjeta, parciales, debido).** Hoy `Sale` tiene un único método y un único importe pagado; no se puede representar. | Requiere **desaparcar** la tabla de cobros `SalePayment` de `TODO.md` en su versión completa (la reducida solo arreglaba informes). Ver F3 para el desglose. Bizum conviene hacerlo dentro de F3 para no tocar la caja dos veces. |
| D4 | **Bizum y caja.** La caja del día solo acumula efectivo y tarjeta. | ¿Bizum se suma como "tarjeta" en el cierre o es una tercera columna? Afecta a caja, informe de cobros y dashboard. |
| D5 | **Papelera de servicios.** Hoy solo hay activar/desactivar, no hay borrado. | ¿Borrar de verdad solo si nunca se ha vendido ni citado, y si no, desactivar? Propuesta: sí. |
| D6 | **Tto. domiciliario.** Renombrar "producto" en toda la UI (139 apariciones en 18 ficheros). | ¿Es un renombre literal ("Stock" → ¿sigue igual?, "Productos" → "Ttos. domiciliarios") o también cambia el concepto (p. ej. aparece en presupuestos como línea propia)? Solo texto: S. |
| D7 | **Cierre de caja editable "durante el día hábil".** | ¿Editar significa reabrir la caja cerrada (y que las ventas sigan sumando) o solo corregir el efectivo declarado/retirado? ¿Quién puede: cualquier PIN o solo quien cerró? |
| D8 | **Lector de barras / impresora de tickets.** Pendiente de la info de Javi. | `Product` no tiene campo código/EAN; el lector necesita ese campo (y entra en F7 "buscar por código"). La impresora depende del modelo (ESC/POS vs. imprimir HTML). |
| D9 | **Qué significa "eliminar" un cliente deshabilitado.** Un cliente que lleva meses sin venir tiene citas y ventas; el borrado real las dejaría huérfanas o las arrastraría. | Opción A: borrado real solo si no tiene historial. Opción **B (recomendada): anonimizar** datos personales y conservar historial económico. Ver M10. |

### Decisiones tomadas (4 oct 2026)

| # | Decisión |
|---|---|
| D1 | **Quitar** la tarifa por minuto (solo precio fijo). Migrar servicios `PER_MINUTE` a precio fijo y borrar el selector. Cierra B1. **Hecho** (rama `fix/quitar-tarifa-por-minuto`: migración de datos `€/min × duración`; y las columnas `pricingType`/`pricePerMinuteCents` se eliminan en una segunda migración). |
| D2 | **Opción A**: línea de sesión a precio de bono/sesión (48 €) con dto 100 %. Incluye excluir VOUCHER_SESSION del `discountCents`, columna aparte en informe de empleadas y relleno retroactivo. |
| D3 | **Pagos mixtos en serio (F3 completo, `SalePayment`) con Bizum dentro.** F3 sube de "Después" a antes de Sprint 3; M7 deja de ser suelto. |
| D4 | **Bizum en columna propia** en caja, informe de cobros y dashboard (se paga también por datáfono; se revisará tras un tiempo de uso). |
| D5 | **Papelera**: borrado real si el servicio nunca se vendió ni citó; si no, desactivar con aviso. |
| D6 | **Solo renombre de texto** ("Producto" → "Tto. domiciliario" en UI; nombres internos intactos). |
| D7 | **Corregir importes** del cierre, solo si `date == hoy`, **cualquier PIN**, con registro de quién editó. No se reabre la caja. |
| D2 (retro) | Sí: script de relleno retroactivo para bonos ya vendidos, probado antes en copia de la BD. |
| B3 | Inactividad **60 min** (tope 12 h se mantiene). |
| Q9 | **Todo en MAYÚSCULAS** ("MARIA LOPEZ"), aplicado en servidor al guardar. Alcance confirmado: solo nombres (cliente, servicio, producto, familia, proveedor, cabina, empleada); email, teléfono y notas libres (alergias, observaciones, descripciones) quedan como se escriben. |
| F1 | Presupuesto **editable sin estados** (sin versionado ni caducidad automática; la validez se imprime en el documento). |
| F4 | **Reducido**: la propietaria calcula los incentivos a mano. Solo necesita ver el **total de servicios de una empleada por rango de fechas**. Sin módulo de incentivos; se cubre con el informe de empleadas + M2 (sesiones de bono con precio). Comprobar que el informe permite elegir empleada y rango, y que separa servicios de productos. |
| Q3 | **Mostrador NO crea proveedores**; los crea antes la propietaria en gestión. Se descarta el botón "Nuevo proveedor" en `/stock`; como mucho un texto "pide a gestión que lo dé de alta" cuando falte. |
| D8 | **Sin info aún** de Javi: F5 bloqueada y fuera de los sprints. Opcional sin coste: añadir campo `code` a producto. |
| D9 | **Anonimizar** (opción B): se borran datos personales, se conservan ventas/citas y el **nº de expediente** (`fileNumber`, único por clínica, no se reutiliza). |


---

## 1. Bugs (as-is confirmado en código)

| # | Bug | As-is | Fix | Est. |
|---|---|---|---|---|
| B1 | **Tarifa por minuto no coge el precio en TPV** | Desde cita sí calcula `€/min × duración`. Añadido a mano entra a 0 € porque el formulario guarda `price = 0` para servicios por minuto. | Depende de D1. Si se quita: migración de datos + borrar el selector. | S–M |
| B2 | **Cambiar PIN acepta el mismo que ya tenías** | Solo valida que no sea de *otra* persona. | Comparar hash con el actual y rechazar. | S |
| B3 | **Cierre de sesión a mitad de acción** | Sesión deslizante de 15 min de inactividad (tope 12 h). Al caducar, el proxy redirige a `/login` y se pierde el formulario. Sin aviso en cliente. | (a) Subir inactividad (p. ej. 60 min; decidir). (b) Pantalla de PIN que **conserve** la ruta y el estado en curso en vez de volver al login limpio. (c) Aviso visible "sesión caducada". | S (a) / M (b+c) |
| B4 | **Borrar cliente es inalcanzable desde la UI** (hallazgo propio) | Botón solo con rol ADMIN y acción solo en gestión; `/clients` es solo mostrador (rol WORKER). Además rechaza si hay citas y las FK de ventas/bonos/saldo bloquean el borrado. | Se resuelve dentro de **M10** (ciclo inactivos → deshabilitar → eliminar). | — |
| B5 | **Comentario desactualizado "JWT de 8 h"** en el layout | Realidad: 15 min / 12 h. | Corregir comentario. | S |
| B6 | **Fecha de caja en UTC**, no Europe/Madrid | Ya reconocido en dashboard. Riesgo de caja "de ayer" tras medianoche en invierno/verano. | Centralizar `hoy()` en zona horaria del centro. | S |
| B7 | **`npm run lint` roto** (herramienta de desarrollo, no afecta a la clínica) | Script existe, ESLint (revisor automático de código) no instalado ni configurado. | Instalar `eslint` + `eslint-config-next`, config flat. Lo ejecuta Raquel. | S |

---

## 2. Seguridad y dependencias (urgente, independiente de la reunión)

| # | Ítem | As-is | Acción | Est. |
|---|---|---|---|---|
| S1 | **Next 16.3.1 con RCE crítico en servidores Windows** (GHSA-p293-qw3h-jr36) + 2 RCE más (AVIF, `next/og`) | `npm audit`: 1 crítica, 5 altas, 3 moderadas. El despliegue es en el PC Windows del centro. | Subir a ≥ 16.3.6 y `npm audit fix`. **Prioridad máxima.** Lo ejecuta Raquel. | S |
| S2 | `@prisma/config` alta vía `deepmerge-ts` | Bloqueado hasta Prisma 7. | Planificar salto a Prisma 7 (ver T2). | — |
| S3 | `sharp`, `browserslist`, `@vitest/mocker` | Altas/moderadas con fix disponible. | Entra en el mismo `audit fix`. | S |

---

## 3. Cambios rápidos (S, sin decisión pendiente)

| # | Cambio | As-is | To-be |
|---|---|---|---|
| Q1 | "Usuarios" → **"Personal"** en gestión del centro | Label en sidebar y título de `/workers`. | Renombrar. |
| Q2 | **Fecha de alta en el listado** de clientes | `createdAt` existe y se ve en la ficha, no en el listado. | Columna ordenable. |
| Q3 | **Alta de proveedor desde Stock** | Solo desde `/products`, pestaña Proveedores (gestión). `/stock` es mostrador y no crea nada. | Botón "Nuevo proveedor" en el selector de proveedor de `/stock` (requiere decidir si mostrador puede crear proveedores). |
| Q4 | **Filtro por familia al añadir servicios a un bono** | Combobox con familias como grupos; busca por texto. | Selector de familia previo que acorte la lista. |
| Q5 | **Ordenación por cabecera en el resto de tablas** | Componente genérico ya existe; aplicado en 4 pantallas. Pendientes: historial citas, personal, servicios, productos (2), stock, bonos, cabinas, horarios/vacaciones y los 9 informes. | Enchufar cabeceras y comparadores. S por tabla, M el lote. |
| Q6 | **Informe de clientes nuevos filtrado por "cómo nos ha conocido"** | El campo `referralSource` se captura pero no se usa en ningún informe. | Desglose por origen en `/reports/clientes` (bloque "Nuevas vs. recurrentes") + filtro. |
| Q7 | **Filtro "no viene desde hace X"** | Movido a **M10** (requisito ampliado por la stakeholder). | | 
| Q8 | **Dashboard: próximas citas enriquecidas** | Muestra fecha, hora, cliente, servicio, empleada. | Añadir última visita (qué se hizo), alergias y observaciones (expandible). |
| Q9 | **Capitalizar campos de texto** rellenados por el usuario | Solo `trim()`. | Decidir regla (Capitalizar Cada Palabra vs. Primera letra) y aplicarla en servidor al guardar nombres de cliente, servicio, producto, familia, proveedor. |
| Q10 | **Casilla de redondeo / dto en € sobre el total** de la venta | `discountCents` es derivado de las líneas; no hay dto global ni redondeo. | Campo "ajuste" en céntimos (negativo) que se guarda aparte y se refleja en ticket, caja e informe de cobros. |
| Q11 | **Descripción en el concepto de la línea** y búsqueda por descripción | El concepto copia el nombre. Buscador de productos solo por nombre. | Concepto = nombre + descripción; búsqueda por nombre o descripción. "Código" requiere campo nuevo (ver D8). |
| Q12 | **Servicios en modo mostrador, solo lectura** | `/services` es solo gestión. | Vista de catálogo de servicios en mostrador, con filtro por familia, sin edición. |

---

## 4. Mejoras medianas (M)

| # | Mejora | As-is | To-be | Dep. |
|---|---|---|---|---|
| M1 | **Caja: cierre editable en el día + historial a gestión** | Única pantalla `/cash-register` (mostrador): caja de hoy + historial de 30. No se puede reabrir ni editar. | Editar cierre solo si `date == hoy`. Nueva pantalla "Cajas" en gestión con historial completo y detalle por día. En mostrador solo el día actual. | D7 |
| M2 | **Sesión de bono con precio real** (facturación por empleada + ficha de cliente + listado de ventas) | Línea a 0 €, dto 0. Informe de empleadas no ve el valor. | Según D2. Toca `createSale`, informe empleadas, ficha de cliente, histórico de ventas. Posible relleno retroactivo. | D2 |
| M3 | **Citas pasadas sin cerrar** | Se quedan en PENDING para siempre salvo que se cobren (→ DONE) o se marquen a mano. No hay auto-marcado ni "cerrar día". | Marca visual "sin cerrar" en agenda + acción "Cerrar día" que las repasa (realizada / no vino) en bloque. Rama propia. | — |
| M4 | **Teléfono de recordatorio elegible** | `phone` + `phone2` con etiquetas libres; el recordatorio siempre va a `phone`. | Campo "teléfono preferido para avisos" en cliente (por defecto) y selector al crear cita. Tocar worker de recordatorios y envío manual. | — |
| M5 | **Papelera de servicios** | Solo activar/desactivar. | Borrado real si sin uso; si no, desactivar con aviso. | D5 |
| M6 | **Tto. domiciliario** (renombre global) | "Producto" en 18 ficheros. | Renombre de UI; mantener nombres internos. | D6 |
| M7 | **Bizum** como método de pago | CASH, CARD, DEBT (BALANCE y GIFT_CARD internos). Sin Bizum. | Preferible dentro de F3. Suelto solo si F3 se retrasa. | D4, F3 |
| M8 | **Buscadores: familia primero, siempre** | TPV ya es a dos niveles para servicios. Productos no tienen familia. Bonos: grupos. | Unificar patrón familia → lista en bonos y en vista de servicios. Para productos haría falta "familia de producto" (modelo nuevo). | — |
| M10 | **Ciclo clientes inactivos: filtrar → deshabilitar → eliminar** (desde mostrador) | Filtro de estado (Todos/Activos/Inactivos/Con aviso 180 d global). Deshabilitar uno a uno en ficha. Eliminar inalcanzable (B4) y rechazado si hay citas; FKs de ventas/bonos/saldo sin cascada. | (1) Filtro "sin venir desde hace N meses" combinable con estado. (2) Selección múltiple + "Deshabilitar seleccionados". (3) "Eliminar" solo sobre deshabilitados, con PIN desde mostrador. (4) Qué es eliminar: **A** borrado real solo sin historial, o **B anonimizar** (borrar datos personales, conservar ventas/citas; recomendada, cumple derecho de supresión sin romper informes). Descartado borrado en cascada. | D9 |
| M9 | **Lint + Prisma config** | Sin ESLint; clave `prisma` en `package.json` deprecada; sin `prisma.config.ts`. | ESLint flat config; mover seed a `prisma.config.ts`. | T2 |

---

## 5. Features grandes (L / XL)

### F1 — Presupuestos (L)
Nuevo módulo `Movimientos > Presupuestos`. No es venta ni mueve caja ni stock.

- **Modelo** `Quote` + `QuoteLine`: nº consecutivo por centro, fecha, empleada (PIN), cliente existente, notas (opcional), forma de pago (texto), validez (por defecto 1 mes desde emisión), cláusula de tto. domiciliario (auto si alguna línea es producto), total.
- **Líneas**: servicio o tto. domiciliario, nombre, familia, precio, dto %, cantidad (sesiones / unidades).
- **Impresión**: plantilla HTML → "Imprimir / Guardar PDF" del navegador con nombre y fecha; **no** se almacena el PDF, solo el registro.
- **Fuera de alcance v1**: convertir presupuesto en venta (apuntar como siguiente paso).
- Preguntas: ¿se puede editar un presupuesto emitido o se versiona? ¿Estados (emitido / aceptado / caducado)?

### F2 — Reservas de producto y lista de pedidos (L)
- **As-is**: aviso de bajo mínimo con chips; "Registrar pedido" en realidad es una entrada de stock directa, no existe pedido ni reserva.
- **To-be**: pantalla "Pedidos / reservas" (complemento de stock) que junta (a) reservas de cliente sobre producto y (b) auto-propuestas de reposición cuando `stock < stockMin` con cantidad sugerida. Acción "marcar como pedido" que lo quita de la lista (y opcionalmente genera la entrada al recibir).
- Modelo nuevo `ProductReservation` + `PurchaseSuggestion` (o una sola tabla con tipo).

### F3 — Pagos parciales / mixtos + Bizum (L–XL)
Ejemplo: ticket de 80 €, 50 € en efectivo y 30 € con tarjeta. Hoy imposible: un método y un `paidCents` por venta; la caja suma el importe entero a efectivo o a tarjeta; `payDebt` pisa el método anterior.

Desaparcar `SalePayment` (`TODO.md`) en versión completa:
- **Modelo**: una fila por entrada de dinero (importe, método incl. Bizum, quién cobró por PIN, fecha).
- **Cobro en venta**: `createSale` recibe lista de pagos; si la suma no llega al total, el resto queda como deuda. Pantalla de cobro con importe por método y "resto" automático.
- **Cobro de deuda**: añade filas en vez de pisar la venta; permite parcial (debe 30, paga 20).
- **Caja**: suma fila a fila por método. Bizum según D4 (columna propia o dentro de tarjeta).
- **Informes y dashboard**: los 4 lectores de `sale.paymentMethod` pasan a leer cobros por fecha (arregla de paso la deuda de mayo cobrada en septiembre).
- **Ticket** con desglose de pagos. Columna "Pago" del listado: "Mixto" con detalle.
- **Relleno retroactivo**: una fila por venta ya cobrada; sin esto los meses pasados quedan vacíos.
- Se cruza con Q10 (redondeo del total va antes de repartir pagos).

Si se retrasa, **Bizum solo** es S–M: valor en el selector, columna en caja, etiqueta en informes.

### F4 — Gestión de incentivos (XL, sin definir)
- No existe nada. Necesita definición funcional: ¿comisión % por servicio/producto/bono? ¿objetivos mensuales? ¿por empleada o por familia? Base de datos disponible: `SaleLine.workerId` y `VoucherSession.workerId`. Depende de M2 para que el bono cuente.

### F5 — Hardware: lector de códigos de barras + impresora de tickets (M–L)
- Bloqueado por info de Javi (D8). Lector: campo `code` en producto + foco en buscador del TPV. Impresora: decidir ESC/POS (driver) o impresión HTML del ticket que ya existe.

---

## 6. Deuda técnica

| # | Ítem | Est. |
|---|---|---|
| T1 | ESLint instalado y config (B7). | S |
| T2 | Salto a **Prisma 7** (elimina deprecación de `package.json#prisma` y la vulnerabilidad de `@prisma/config`). Revisar breaking changes y la rama `fix/pin-liberado` que ensucia la BD. | M |
| T3 | **recharts 2 → 3** (rama 2.x muerta). Afecta a los informes con gráfica. | M |
| T4 | Tests de UI/e2e: no hay. Valorar Playwright para TPV y caja antes de F3. | L |

---

## 7. Línea ERP (decisiones de producto, no código todavía)

- **Multitenant**: separación lógica (columna `clinicId`, ya existe) vs. instancia por cliente. La stakeholder desconfía de la lógica por seguridad. Evaluar middle ground: una BD por cliente, una sola app. Documentar en ADR.
- **Cifrado**: en reposo (SQLite → ¿SQLCipher o cifrado de disco?), en tránsito (HTTPS ya en despliegue local; ver `DEPLOY.md`), en ejecución (no aplica a este stack salvo secretos).
- **Roles y usabilidad**: hoy hay 2 roles × 2 modos. Caso real: Lucía (admin) cobra en mostrador y necesita ver cosas de admin; Marta (empleada) no. Opciones: (a) elevación temporal con contraseña desde mostrador, (b) sesión de admin en mostrador con auto-bloqueo corto. Descartar "polling de código" (anotado como poco práctico).
- **Avisos por WhatsApp**: **ya existe** (worker cada 5 min + envío manual, Meta Cloud API, modo simulado sin credenciales). Lo que falta es contratar/configurar la cuenta de Meta y activar `whatsappEnabled` por centro.
- **Legal**: documento de consentimiento (comunicaciones, marketing, protección de datos) y contrato con traslado del riesgo operativo al cliente. Redacción con asesoría, no desarrollo. Hay un `Guia-mostrador.docx` sin versionar en el repo que podría ser el inicio de la documentación de usuario.

---

## 8. Preguntas para la stakeholder (próxima reunión)

1. ¿Quitamos la tarifa por minuto del todo? (D1)
2. En la sesión de bono: ¿qué precio quiere ver en informe de empleada, en la ficha de cliente y en el listado de ventas? ¿Aplicar a bonos ya vendidos? (D2)
3. ¿Pagos mixtos es prioridad real o basta con Bizum como método simple? (D3, D4)
4. ¿Bizum cuenta como tarjeta en el cierre de caja o aparte? (D4)
5. ¿Editar un cierre de caja = reabrir o solo corregir importes? ¿Quién puede? (D7)
6. ¿Qué ocurre con un presupuesto una vez emitido: se edita, se versiona, caduca, se convierte en venta? (F1)
7. ¿Qué es un incentivo para ella: comisión, objetivo, bonus? ¿Sobre qué base? (F4)
8. Regla de capitalización: ¿"Nombre Apellido" o solo primera letra? ¿También para servicios con siglas (p. ej. "IPL")? (Q9)
9. ¿Cuánto tiempo de inactividad es razonable antes de pedir el PIN? (B3)
10. Al "eliminar" un cliente deshabilitado, ¿desaparece todo aunque haya comprado, o solo sus datos personales conservando lo cobrado? (D9, M10)
11. Modelo de lector de barras e impresora (Javi). (D8)

---

## 9. Propuesta de orden

**Sprint 0 — ahora (sin esperar reunión)**
S1 audit fix + Next ≥ 16.3.6 · B2 PIN igual · B3a subir inactividad ·  B5/B6 · T1 ESLint.

**Sprint 1 — quick wins visibles para la clínica**
Q1 Personal · Q2 fecha de alta · Q4 familia en bonos · Q6 informe por origen ·  Q8 dashboard · Q11 descripción en concepto · Q5 ordenación (lote).

**Sprint 2 — tras cerrar D1, D2, D7**
B1 quitar tarifa por minuto · M2 precio sesión bono · M1 caja · M3 citas sin cerrar + cerrar día · M4 teléfono de aviso · M10 ciclo inactivos · B3b PIN que conserva la acción.

**Sprint 3 — features**
Q10 redondeo (antes de F3, va antes de repartir pagos) · F3 pagos mixtos + Bizum (D3, D4; T4 tests de TPV/caja antes si es posible) · F1 Presupuestos · M5 papelera · M6 Tto. domiciliario · Q9 capitalizar · Q12 servicios en mostrador.

**Después**
F2 pedidos/reservas · T2 Prisma 7 · T3 recharts 3 · F5 hardware (cuando llegue la info).
