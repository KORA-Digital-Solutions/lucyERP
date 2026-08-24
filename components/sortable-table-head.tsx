"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type SortDir = "asc" | "desc"
export interface SortRule<K extends string = string> {
  key: K
  dir: SortDir
}

/**
 * Ordenación multi-columna para las vistas de tabla.
 *
 * `sort` es una lista ordenada por prioridad: el primer criterio manda y los
 * siguientes solo desempatan. Clic normal reemplaza la ordenación y cicla
 * asc → desc → sin ordenar; shift+clic añade la columna como desempate.
 *
 * `comparators` debe tener identidad estable (definirlo fuera del componente),
 * si no el useMemo se recalcula en cada render.
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  comparators: Record<K, (a: T, b: T) => number>,
  initial: SortRule<K>[] = [],
) {
  const [sort, setSort] = useState<SortRule<K>[]>(initial)

  const sorted = useMemo(() => {
    if (sort.length === 0) return rows
    return [...rows].sort((a, b) => {
      for (const { key, dir } of sort) {
        const cmp = comparators[key](a, b)
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp
      }
      return 0
    })
  }, [rows, sort, comparators])

  function toggleSort(key: K, additive: boolean) {
    setSort((prev) => {
      const idx = prev.findIndex((r) => r.key === key)

      if (!additive) {
        // Ciclo de la columna que ya manda en solitario: asc → desc → sin orden.
        if (idx === 0 && prev.length === 1) {
          return prev[0].dir === "asc" ? [{ key, dir: "desc" as SortDir }] : []
        }
        return [{ key, dir: "asc" as SortDir }]
      }

      if (idx === -1) return [...prev, { key, dir: "asc" as SortDir }]
      const next = [...prev]
      if (next[idx].dir === "asc") {
        next[idx] = { key, dir: "desc" }
        return next
      }
      next.splice(idx, 1) // tercer shift+clic quita el criterio
      return next
    })
  }

  function clearSort() {
    setSort([])
  }

  return { sort, sorted, toggleSort, clearSort }
}

/** Comparadores reutilizables, con los nulos siempre al final. */
export function byText<T>(get: (r: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const va = (get(a) ?? "").trim()
    const vb = (get(b) ?? "").trim()
    if (!va && !vb) return 0
    if (!va) return 1
    if (!vb) return -1
    return va.localeCompare(vb, "es", { sensitivity: "base", numeric: true })
  }
}

export function byNumber<T>(get: (r: T) => number | null | undefined) {
  return (a: T, b: T) => {
    const va = get(a)
    const vb = get(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return va - vb
  }
}

/** Fechas en ISO (YYYY-MM-DD), que se ordenan bien como texto. */
export function byDate<T>(get: (r: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const va = get(a)
    const vb = get(b)
    if (!va && !vb) return 0
    if (!va) return 1
    if (!vb) return -1
    return va < vb ? -1 : va > vb ? 1 : 0
  }
}

export function byBoolean<T>(get: (r: T) => boolean) {
  return (a: T, b: T) => Number(get(a)) - Number(get(b))
}

interface SortableTableHeadProps<K extends string> {
  sortKey: K
  sort: SortRule<K>[]
  onToggle: (key: K, additive: boolean) => void
  className?: string
  children: React.ReactNode
}

export function SortableTableHead<K extends string>({
  sortKey,
  sort,
  onToggle,
  className,
  children,
}: SortableTableHeadProps<K>) {
  const idx = sort.findIndex((r) => r.key === sortKey)
  const rule = idx === -1 ? null : sort[idx]

  return (
    <TableHead
      className={cn("p-0", className)}
      aria-sort={rule ? (rule.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={(e) => onToggle(sortKey, e.shiftKey)}
        title="Clic para ordenar · Shift+clic para añadir un criterio de desempate"
        className={cn(
          "group flex h-full w-full items-center gap-1 px-2 py-3 text-left font-medium transition-colors hover:text-foreground",
          rule ? "text-foreground" : "text-muted-foreground",
          className?.includes("text-right") && "justify-end",
        )}
      >
        {children}
        {rule ? (
          rule.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 shrink-0" /> : <ArrowDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
        )}
        {sort.length > 1 && idx !== -1 && (
          <span className="rounded bg-muted px-1 text-[10px] font-semibold leading-4 text-muted-foreground">
            {idx + 1}
          </span>
        )}
      </button>
    </TableHead>
  )
}
