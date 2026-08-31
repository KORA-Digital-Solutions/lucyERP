import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import {
  FACTURA, descuentos, esPeriodoId, evolucionMensual, facturacionPorEmpleada, finDeEvolucion,
  formasDeCobro, ingresosPorFamilia, inicioDeEvolucion,
  ranking, resolverPeriodo, totales, variacion,
  type LineaDeInforme,
} from "@/lib/reports"
import { ReportsClient } from "@/components/reports-client"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

const MESES_DE_EVOLUCION = 6

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>
}) {
  const { periodo, desde, hasta } = await searchParams
  const clinic = await getActiveClinic()

  // Lo que llegue raro por la URL cae en "este mes" en vez de reventar: es una
  // pantalla a la que se llega con enlaces guardados.
  const p = resolverPeriodo(esPeriodoId(periodo) ? periodo : "mes", { desde, hasta })

  const delCentroEntre = (gte: Date, lte: Date) => ({
    sale: { clinicId: clinic.id, createdAt: { gte, lte } },
  })
  // La gráfica acaba en el mes en curso aunque el período llegue a diciembre.
  const ultimoMes = finDeEvolucion(p.hasta)
  const inicioEvolucion = inicioDeEvolucion(ultimoMes, MESES_DE_EVOLUCION)

  const [filas, ventas, tramoAnterior, filasEvolucion, usuarias] = await Promise.all([
    // Sin filtrar por tipo: las tarjetas regalo no facturan, pero la pantalla
    // dice cuánto saldo se ha vendido y para eso hacen falta sus líneas.
    prisma.saleLine.findMany({
      where: delCentroEntre(p.desde, p.hasta),
      select: {
        saleId: true, type: true, quantity: true, totalCents: true, workerId: true,
        unitPriceCents: true, serviceId: true, productId: true,
        service: { select: { name: true, family: { select: { name: true } } } },
        product: { select: { name: true } },
        // Quién cobró el ticket: es quien aplica el descuento.
        sale: { select: { userId: true } },
      },
    }),
    // La forma de cobro vive en la venta, no en la línea: se paga el ticket
    // entero de una manera, no cada concepto por su lado.
    prisma.sale.findMany({
      where: { clinicId: clinic.id, createdAt: { gte: p.desde, lte: p.hasta } },
      select: { paymentMethod: true, totalCents: true },
    }),
    prisma.saleLine.aggregate({
      _sum: { totalCents: true },
      where: { type: { in: FACTURA }, ...delCentroEntre(p.anterior.desde, p.anterior.hasta) },
    }),
    prisma.saleLine.findMany({
      where: { type: { in: FACTURA }, ...delCentroEntre(inicioEvolucion, p.hasta) },
      select: { type: true, totalCents: true, sale: { select: { createdAt: true } } },
    }),
    // También las desactivadas: si alguien facturó en el período y luego se
    // fue, su fila tiene que seguir teniendo nombre.
    prisma.user.findMany({
      where: { clinicId: clinic.id },
      select: { id: true, name: true, lastName: true, color: true, active: true },
    }),
  ])

  const lineas: LineaDeInforme[] = filas.map((l) => ({
    saleId: l.saleId,
    type: l.type,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    totalCents: l.totalCents,
    workerId: l.workerId,
    cobradoPorId: l.sale.userId,
    serviceId: l.serviceId,
    serviceName: l.service?.name ?? null,
    familyName: l.service?.family.name ?? null,
    productId: l.productId,
    productName: l.product?.name ?? null,
  }))

  const resumen = totales(lineas)
  const empleadas = facturacionPorEmpleada(lineas)
  const rebajas = descuentos(lineas)
  const porNombre = new Map(usuarias.map((u) => [u.id, u]))
  const nombreDe = (id: string | null) => {
    const u = id ? porNombre.get(id) : null
    return u ? [u.name, u.lastName].filter(Boolean).join(" ") : "Sin asignar"
  }

  return (
    <ReportsClient
      periodo={{
        id: p.id,
        etiqueta: p.etiqueta,
        etiquetaAnterior: p.anterior.etiqueta,
        desde: p.desde.toISOString(),
        hasta: p.hasta.toISOString(),
      }}
      resumen={resumen}
      variacion={variacion(resumen.totalCents, tramoAnterior._sum.totalCents ?? 0)}
      empleadas={empleadas.map((e) => {
        const u = e.workerId ? porNombre.get(e.workerId) : null
        return {
          ...e,
          nombre: nombreDe(e.workerId),
          color: u?.color ?? "#9AA0A6",
          activa: u?.active ?? false,
        }
      })}
      servicios={ranking(lineas, "SERVICE")}
      productos={ranking(lineas, "PRODUCT")}
      familias={ingresosPorFamilia(lineas)}
      cobros={formasDeCobro(ventas)}
      descuentos={{
        ...rebajas,
        filas: rebajas.filas.map((f) => ({ ...f, nombre: nombreDe(f.userId) })),
      }}
      evolucion={evolucionMensual(
        filasEvolucion.map((l) => ({ createdAt: l.sale.createdAt, type: l.type, totalCents: l.totalCents })),
        ultimoMes,
        MESES_DE_EVOLUCION,
      )}
    />
  )
}
