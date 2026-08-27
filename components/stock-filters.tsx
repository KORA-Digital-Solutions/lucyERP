"use client"

import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SupplierRow } from "@/components/products-client"

/**
 * Los filtros del listado de productos, compartidos por las dos pantallas: el
 * stock del mostrador y el catálogo de la gestión.
 *
 * Están juntos aquí porque se buscan las mismas cosas desde los dos sitios —el
 * de un proveedor, los que quedan por debajo de tres— y tener dos copias
 * significa arreglar una y olvidarse de la otra.
 *
 * El rango va en dos campos sueltos y vacíos por defecto: vacío es "sin tope",
 * no cero. "De 0 a 3" y "hasta 3" se escriben distinto y quien busca lo que
 * está a punto de acabarse quiere lo segundo. Se pintan como el rango de edad
 * de Clientes, que ya hace lo mismo.
 */
interface Props {
  search: string
  onSearch: (v: string) => void
  supplierFilter: string
  onSupplierFilter: (v: string) => void
  suppliers: SupplierRow[]
  desde: string
  onDesde: (v: string) => void
  hasta: string
  onHasta: (v: string) => void
}

/** Si hay algo puesto: sirve para el botón de limpiar y para el "sin resultados". */
export function hayFiltros(search: string, supplierFilter: string, desde: string, hasta: string) {
  return search.trim() !== "" || supplierFilter !== "ALL" || desde !== "" || hasta !== ""
}

export function StockFilters({
  search, onSearch,
  supplierFilter, onSupplierFilter, suppliers,
  desde, onDesde, hasta, onHasta,
}: Props) {
  const activos = hayFiltros(search, supplierFilter, desde, hasta)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar producto…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="pl-8 w-56"
        />
      </div>

      <select
        value={supplierFilter}
        onChange={(e) => onSupplierFilter(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
      >
        <option value="ALL">Todos los proveedores</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}{!s.active ? " (inactivo)" : ""}</option>
        ))}
      </select>

      {/* Igual que el rango de edad en Clientes: sin recuadro alrededor, para
          que los campos se lean como dos casillas más de la fila de filtros. */}
      <div className="flex items-center gap-2">
        <Label htmlFor="stock-desde" className="text-xs font-normal text-muted-foreground">Stock</Label>
        <Input
          id="stock-desde"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Desde"
          className="w-24"
          value={desde}
          onChange={(e) => onDesde(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">a</span>
        <Input
          id="stock-hasta"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Hasta"
          className="w-24"
          value={hasta}
          onChange={(e) => onHasta(e.target.value)}
        />
      </div>

      {activos && (
        <Button
          variant="ghost"
          onClick={() => { onSearch(""); onSupplierFilter("ALL"); onDesde(""); onHasta("") }}
        >
          Limpiar
        </Button>
      )}
    </div>
  )
}
