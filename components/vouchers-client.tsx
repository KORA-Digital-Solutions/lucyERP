"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, ToggleRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { saveVoucherTemplate, toggleVoucherTemplateActive, deleteVoucherTemplate } from "@/lib/voucher-actions"
import type { VoucherTemplateRow } from "@/lib/voucher-actions"
import { formatPrice } from "@/lib/format"
import {
  DEFAULT_VOUCHER_SESSIONS, sessionDiscountPercent, sessionSavingsCents,
  suggestedBasePriceCents, suggestedVoucherName,
  voucherFinalPriceCents, voucherPricePerSessionCents, voucherTotals,
} from "@/lib/vouchers"
import { useTableSort, SortableTableHead, byBoolean, byNumber, byText } from "@/components/sortable-table-head"

const VOUCHER_SORTERS = {
  bono: byText<VoucherTemplateRow>((r) => r.name),
  incluye: byText<VoucherTemplateRow>((r) => r.services.map((s) => s.name).join(", ")),
  sesiones: byNumber<VoucherTemplateRow>((r) => r.totalSessions),
  // La tarifa solo se enseña cuando difiere del precio: sin ahorro sale "—".
  tarifa: byNumber<VoucherTemplateRow>((r) => (r.savingsCents > 0 ? r.basePriceCents : null)),
  precio: byNumber<VoucherTemplateRow>((r) => r.finalPriceCents),
  estado: byBoolean<VoucherTemplateRow>((r) => r.active),
}

type VoucherSortKey = keyof typeof VOUCHER_SORTERS

export interface VoucherServiceOption {
  id: string
  name: string
  priceCents: number
  familyName: string
}

/** Una línea del bono mientras se edita: los números viven como texto. */
type LineaEnEdicion = {
  serviceId: string
  sessions: string
  basePrice: string
  discount: string
  /**
   * La tarifa se recalcula sola al cambiar las sesiones, pero deja de hacerlo
   * en cuanto se escribe a mano: pisar lo que acaba de teclear alguien es la
   * forma más rápida de que deje de fiarse de la pantalla.
   */
  priceTouched: boolean
}

function num(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function nuevaLinea(servicio: VoucherServiceOption): LineaEnEdicion {
  return {
    serviceId: servicio.id,
    sessions: String(DEFAULT_VOUCHER_SESSIONS),
    basePrice: (suggestedBasePriceCents(servicio.priceCents, DEFAULT_VOUCHER_SESSIONS) / 100).toFixed(2),
    discount: "0",
    priceTouched: false,
  }
}

/**
 * Gestión de bonos: el catálogo de packs que el centro pone a la venta.
 *
 * Cada servicio del bono lleva sus propias sesiones, su tarifa y su descuento,
 * porque un pack que mezcla un láser y un facial no se puede vender a tanto la
 * sesión: cada tratamiento vale lo que vale. La tarifa se propone como precio
 * del servicio por sesiones, y el nombre se propone a partir de lo que lleva
 * dentro; las dos cosas se pueden reescribir a mano.
 */
export function VouchersClient({
  rows, services,
}: {
  rows: VoucherTemplateRow[]
  services: VoucherServiceOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<VoucherTemplateRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [borrando, setBorrando] = useState<VoucherTemplateRow | null>(null)

  const [lineas, setLineas] = useState<LineaEnEdicion[]>([])
  const [name, setName] = useState("")
  const [nameTouched, setNameTouched] = useState(false)
  const [activo, setActivo] = useState(true)
  const [buscadorAbierto, setBuscadorAbierto] = useState(false)
  // La familia con la que se acota la lista de servicios; vacía, todas. Se
  // conserva entre servicio y servicio: un bono de láser añade varios seguidos.
  const [familiaElegida, setFamiliaElegida] = useState("")

  const { sort, sorted: sortedRows, toggleSort } =
    useTableSort<VoucherTemplateRow, VoucherSortKey>(rows, VOUCHER_SORTERS)

  const servicioPorId = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  )

  function openNew() {
    setEditing(null)
    setLineas([])
    setName("")
    setNameTouched(false)
    setActivo(true)
    setFamiliaElegida("")
    setOpen(true)
  }

  function openEdit(r: VoucherTemplateRow) {
    setEditing(r)
    setLineas(r.services.map((s) => ({
      serviceId: s.id,
      sessions: String(s.totalSessions),
      basePrice: (s.basePriceCents / 100).toFixed(2),
      discount: String(s.discountPercent),
      // Lo guardado manda: no se recalcula un precio que ya se decidió.
      priceTouched: true,
    })))
    setName(r.name)
    setNameTouched(true)
    setActivo(r.active)
    setFamiliaElegida("")
    setOpen(true)
  }

  /* ------------------------------ LAS LÍNEAS ------------------------------ */

  function toggleService(servicio: VoucherServiceOption) {
    setLineas((prev) => prev.some((l) => l.serviceId === servicio.id)
      ? prev.filter((l) => l.serviceId !== servicio.id)
      : [...prev, nuevaLinea(servicio)])
  }

  function quitarLinea(serviceId: string) {
    setLineas((prev) => prev.filter((l) => l.serviceId !== serviceId))
  }

  function setSessions(serviceId: string, valor: string) {
    setLineas((prev) => prev.map((l) => {
      if (l.serviceId !== serviceId) return l
      const servicio = servicioPorId.get(serviceId)
      // La tarifa sigue a las sesiones mientras nadie la haya escrito a mano.
      const basePrice = l.priceTouched || !servicio
        ? l.basePrice
        : (suggestedBasePriceCents(servicio.priceCents, num(valor)) / 100).toFixed(2)
      return { ...l, sessions: valor, basePrice }
    }))
  }

  function setBasePrice(serviceId: string, valor: string) {
    setLineas((prev) => prev.map((l) =>
      l.serviceId === serviceId ? { ...l, basePrice: valor, priceTouched: true } : l))
  }

  function setDiscount(serviceId: string, valor: string) {
    setLineas((prev) => prev.map((l) =>
      l.serviceId === serviceId ? { ...l, discount: valor } : l))
  }

  /* ------------------------------ LAS CUENTAS ----------------------------- */

  const lineasConCuentas = useMemo(() => lineas.map((l) => {
    const servicio = servicioPorId.get(l.serviceId)
    const totalSessions = Math.max(0, Math.round(num(l.sessions)))
    const basePriceCents = Math.round(num(l.basePrice) * 100)
    const discountPercent = Math.min(100, Math.max(0, Math.round(num(l.discount))))
    const finalPriceCents = voucherFinalPriceCents(basePriceCents, discountPercent)
    return {
      ...l,
      serviceName: servicio?.name ?? "Servicio",
      servicePriceCents: servicio?.priceCents ?? 0,
      totalSessions, basePriceCents, discountPercent, finalPriceCents,
      pricePerSessionCents: voucherPricePerSessionCents(finalPriceCents, totalSessions),
    }
  }).map((l) => ({
    ...l,
    // La comparación que se le cuenta a la clienta: contra lo que pagaría hoy
    // por esa sesión suelta, no contra la tarifa del bono.
    sessionSavingsCents: sessionSavingsCents(l.servicePriceCents, l.pricePerSessionCents),
    sessionDiscountPercent: sessionDiscountPercent(l.servicePriceCents, l.pricePerSessionCents),
    sueltoCents: l.servicePriceCents * l.totalSessions,
  })), [lineas, servicioPorId])

  const totales = useMemo(() => voucherTotals(lineasConCuentas), [lineasConCuentas])
  // Lo que costarían esas mismas sesiones sueltas, que es contra lo que se
  // compara al vender. No es la tarifa del bono: esa se puede haber tocado.
  const sueltoTotalCents = lineasConCuentas.reduce((n, l) => n + l.sueltoCents, 0)
  const ahorroTotalCents = sueltoTotalCents - totales.finalPriceCents

  // El nombre propuesto sigue a los servicios y a sus sesiones hasta que se
  // escribe uno a mano. Se calcula al vuelo en vez de guardarse en un efecto:
  // así no hay dos estados que puedan discrepar.
  const nombrePropuesto = useMemo(
    () => suggestedVoucherName(lineasConCuentas.map((l) => ({
      serviceName: l.serviceName, totalSessions: l.totalSessions,
    }))),
    [lineasConCuentas],
  )
  const nombreEfectivo = nameTouched ? name : nombrePropuesto

  const porFamilia = useMemo(() => {
    const mapa = new Map<string, VoucherServiceOption[]>()
    for (const s of services) {
      const lista = mapa.get(s.familyName) ?? []
      lista.push(s)
      mapa.set(s.familyName, lista)
    }
    return [...mapa.entries()]
  }, [services])

  /* -------------------------------- ACCIONES ------------------------------ */

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (lineas.length === 0) {
      toast.error("Elige al menos un servicio para el bono.")
      return
    }
    const fd = new FormData()
    fd.set("name", nombreEfectivo.trim())
    fd.set("active", activo ? "on" : "")
    for (const l of lineasConCuentas) {
      fd.append("serviceIds", l.serviceId)
      fd.set(`sessions_${l.serviceId}`, String(l.totalSessions))
      fd.set(`basePrice_${l.serviceId}`, String(l.basePriceCents / 100))
      fd.set(`discount_${l.serviceId}`, String(l.discountPercent))
    }
    setLoading(true)
    const res = await saveVoucherTemplate(editing?.id ?? null, fd)
    setLoading(false)
    if (res.ok) {
      toast.success("Bono guardado.")
      setOpen(false)
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  async function onToggle(r: VoucherTemplateRow) {
    const res = await toggleVoucherTemplateActive(r.id, !r.active)
    if (res.ok) router.refresh()
    else toast.error(res.error ?? "Error")
  }

  async function onDelete() {
    if (!borrando) return
    const res = await deleteVoucherTemplate(borrando.id)
    setBorrando(null)
    if (res.ok) {
      toast.success("Bono eliminado.")
      router.refresh()
    } else toast.error(res.error ?? "Error al eliminar.")
  }

  /* --------------------------------- VISTA -------------------------------- */

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bonos</h1>
          <p className="text-muted-foreground">
            {rows.length === 1 ? "1 bono en el catálogo" : `${rows.length} bonos en el catálogo`}
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo bono
        </Button>
      </div>

      <div className="space-y-6 p-6">
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="bono" sort={sort} onToggle={toggleSort}>Bono</SortableTableHead>
                <SortableTableHead sortKey="incluye" sort={sort} onToggle={toggleSort}>Qué incluye</SortableTableHead>
                <SortableTableHead sortKey="sesiones" sort={sort} onToggle={toggleSort} className="text-right">Sesiones</SortableTableHead>
                <SortableTableHead sortKey="tarifa" sort={sort} onToggle={toggleSort} className="text-right">Tarifa</SortableTableHead>
                <SortableTableHead sortKey="precio" sort={sort} onToggle={toggleSort} className="text-right">Precio</SortableTableHead>
                <SortableTableHead sortKey="estado" sort={sort} onToggle={toggleSort}>Estado</SortableTableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end text-xs font-normal text-muted-foreground">
                    <span className="flex w-32 items-center justify-center gap-1">
                      <ToggleRight className="h-3.5 w-3.5 text-primary" /> Activar/Desactivar
                    </span>
                    <span className="flex w-20 items-center justify-center gap-1">
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </span>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {r.services.map((s) => (
                        <p key={s.id} className="text-xs">
                          <span className="font-medium">{s.name}</span>
                          <span className="text-muted-foreground">
                            {" · "}{s.totalSessions} {s.totalSessions === 1 ? "sesión" : "sesiones"}
                            {" · "}{formatPrice(s.pricePerSessionCents)} c/u
                            {s.discountPercent > 0 && ` · ${s.discountPercent}% dto.`}
                          </span>
                        </p>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.totalSessions}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.savingsCents > 0 ? formatPrice(r.basePriceCents) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPrice(r.finalPriceCents)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.active ? "secondary" : "outline"} className={r.active ? "" : "text-muted-foreground"}>
                      {r.active ? "Activo" : "Inactivo"}
                    </Badge>
                    {r.soldCount > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.soldCount === 1 ? "1 vendido" : `${r.soldCount} vendidos`}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <span className="flex w-32 justify-center">
                        <Switch checked={r.active} onCheckedChange={() => onToggle(r)} />
                      </span>
                      <span className="flex w-20 justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {/* Un bono ya vendido no se borra: se desactiva. */}
                        {r.soldCount === 0 && (
                          <Button variant="ghost" size="icon" onClick={() => setBorrando(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Todavía no hay bonos. Crea el primero con &quot;Nuevo bono&quot;.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar bono" : "Nuevo bono"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Servicios que incluye</Label>
                {/* Un desplegable con buscador y las familias como grupos: la
                    lista de casillas se hacía interminable en cuanto el centro
                    tiene el catálogo entero dado de alta. */}
                <Popover open={buscadorAbierto} onOpenChange={setBuscadorAbierto}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={services.length === 0}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Añadir servicio
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[22rem] p-0" align="end">
                    {/* La familia va antes que el buscador: con el catálogo
                        entero dado de alta, elegirla acorta la lista a lo que
                        se está buscando sin tener que escribir nada. */}
                    <div className="flex flex-wrap gap-1 border-b p-2">
                      {[["", "Todas"], ...porFamilia.map(([f]) => [f, f])].map(([valor, etiqueta]) => (
                        <button
                          key={valor || "todas"}
                          type="button"
                          onClick={() => setFamiliaElegida(valor)}
                          className={cn(
                            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                            familiaElegida === valor
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/70",
                          )}
                        >
                          {etiqueta}
                        </button>
                      ))}
                    </div>
                    <Command>
                      <CommandInput placeholder={familiaElegida ? `Buscar en ${familiaElegida}…` : "Buscar por servicio o familia…"} />
                      <CommandList>
                        <CommandEmpty>Nada con ese nombre.</CommandEmpty>
                        {porFamilia.filter(([familia]) => !familiaElegida || familia === familiaElegida).map(([familia, lista]) => {
                          // Lo que ya está en el bono no se vuelve a ofrecer.
                          const libres = lista.filter((x) => !lineas.some((l) => l.serviceId === x.id))
                          if (libres.length === 0) return null
                          return (
                            <CommandGroup key={familia} heading={familia}>
                              {libres.map((x) => (
                                <CommandItem
                                  key={x.id}
                                  // Se busca también por familia: en el mostrador
                                  // se piensa antes en "depilación" que en el
                                  // nombre exacto del servicio.
                                  value={`${familia} ${x.name}`}
                                  onSelect={() => { toggleService(x); setBuscadorAbierto(false) }}
                                >
                                  <span className="flex-1 truncate">{x.name}</span>
                                  <span className="ml-3 shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {formatPrice(x.priceCents)}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )
                        })}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {services.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No hay servicios activos. Crea alguno antes de montar un bono.
                </p>
              )}
              {services.length > 0 && lineas.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Añade el primer servicio para montar el bono.
                </p>
              )}
            </div>

                        {/* Cada servicio con lo suyo. Es lo que permite que un bono lleve 3
                de láser y 5 de facial, cada uno a su precio. */}
            {lineasConCuentas.length > 0 && (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Servicio</th>
                      <th className="px-2 py-2 text-center font-medium">Sesiones</th>
                      <th className="px-2 py-2 text-center font-medium">Tarifa (€)</th>
                      <th className="px-2 py-2 text-center font-medium">Dto. (%)</th>
                      <th className="px-3 py-2 text-right font-medium">Por sesión</th>
                      <th className="px-3 py-2 text-right font-medium">Precio</th>
                      <th className="w-9" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineasConCuentas.map((l) => (
                      <tr key={l.serviceId} className="border-t">
                        <td className="px-3 py-2 font-medium">{l.serviceName}</td>
                        <td className="px-2 py-2">
                          <Input
                            type="number" min={1} step={1} value={l.sessions}
                            onChange={(e) => setSessions(l.serviceId, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="h-8 w-20 text-center tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number" min={0} step="0.01" value={l.basePrice}
                            onChange={(e) => setBasePrice(l.serviceId, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="h-8 w-24 text-center tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number" min={0} max={100} step={1} value={l.discount}
                            onChange={(e) => setDiscount(l.serviceId, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="h-8 w-20 text-center tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {/* De cuánto a cuánto: es lo que hay que poder decir
                              en el mostrador sin echar la cuenta a mano. */}
                          {l.sessionSavingsCents > 0 && (
                            <span className="block text-xs text-muted-foreground line-through">
                              {formatPrice(l.servicePriceCents)}
                            </span>
                          )}
                          <span className="font-medium text-primary">{formatPrice(l.pricePerSessionCents)}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatPrice(l.finalPriceCents)}
                        </td>
                        <td className="px-1 py-2">
                          <button
                            type="button"
                            onClick={() => quitarLinea(l.serviceId)}
                            title={`Quitar ${l.serviceName} del bono`}
                            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/40">
                    <tr>
                      <td className="px-3 py-2 font-medium">Total del bono</td>
                      <td className="px-2 py-2 text-center tabular-nums">{totales.totalSessions}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">
                        {formatPrice(totales.basePriceCents)}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-muted-foreground">
                        {totales.savingsCents > 0 ? `− ${formatPrice(totales.savingsCents)}` : "—"}
                      </td>
                      <td />
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {formatPrice(totales.finalPriceCents)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {lineasConCuentas.some((l) => l.sessionSavingsCents > 0) && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Para explicárselo a la clienta
                </p>
                <ul className="space-y-1">
                  {lineasConCuentas.filter((l) => l.sessionSavingsCents > 0).map((l) => (
                    <li key={l.serviceId}>
                      <span className="font-medium">{l.serviceName}</span>: suelta le sale a{" "}
                      {formatPrice(l.servicePriceCents)}; con el bono, a{" "}
                      <span className="font-medium text-primary">{formatPrice(l.pricePerSessionCents)}</span>{" "}
                      la sesión — {l.sessionDiscountPercent}% menos, {formatPrice(l.sessionSavingsCents)} de
                      ahorro cada vez.
                    </li>
                  ))}
                </ul>
                {ahorroTotalCents > 0 && (
                  <p className="mt-2 border-t border-primary/20 pt-2">
                    En total se lleva {totales.totalSessions}{" "}
                    {totales.totalSessions === 1 ? "sesión" : "sesiones"} por{" "}
                    <span className="font-medium">{formatPrice(totales.finalPriceCents)}</span> en vez de{" "}
                    {formatPrice(sueltoTotalCents)}: se ahorra {formatPrice(ahorroTotalCents)}.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={nombreEfectivo}
                onChange={(e) => { setName(e.target.value); setNameTouched(true) }}
                placeholder="Se rellena solo con los servicios elegidos"
                required
              />
              {nameTouched && nombrePropuesto && nombrePropuesto !== nombreEfectivo && (
                <button
                  type="button"
                  onClick={() => { setName(nombrePropuesto); setNameTouched(false) }}
                  className="text-xs text-primary underline underline-offset-2"
                >
                  Volver al nombre automático: {nombrePropuesto}
                </button>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="active">{activo ? "Activo" : "Inactivo"}</Label>
                <p className="text-xs text-muted-foreground">
                  Un bono inactivo deja de ofrecerse en el mostrador.
                </p>
              </div>
              <Switch id="active" checked={activo} onCheckedChange={setActivo} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!borrando} onOpenChange={() => setBorrando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el bono &quot;{borrando?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Todavía no se ha vendido ninguno, así que no se pierde nada. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
