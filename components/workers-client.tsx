"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toggleWorkerActive } from "@/lib/actions"
import { WorkerForm } from "@/components/worker-form"
import { EstadoAcceso, WorkerProfileView, type WorkerTab } from "@/components/worker-profile-view"

export interface WorkerRow {
  id: string
  name: string
  lastName: string | null
  email: string | null
  phone: string | null
  role: string
  active: boolean
  color: string
  mustChangePassword: boolean
  hasPassword: boolean
  hasPin: boolean
  mustChangePin: boolean
}

/**
 * El estado del acceso en una sola etiqueta.
 *
 * Antes esta celda pintaba una línea por credencial —dos en las
 * administradoras, una en las trabajadoras— y las filas quedaban de distinta
 * altura. El detalle de cada puerta está en la pestaña "Acceso" de la ficha;
 * en el listado solo hace falta saber si hay algo pendiente.
 */
function resumenAcceso(r: WorkerRow): { tono: "ok" | "warn" | "none"; texto: string } {
  if (r.role === "ADMIN") {
    // La contraseña es su puerta: sin ella no entra a gestionar, tenga PIN o no.
    if (!r.email || !r.hasPassword) return { tono: "none", texto: "Sin contraseña" }
    if (r.mustChangePassword || (r.hasPin && r.mustChangePin)) {
      return { tono: "warn", texto: "Pendiente de cambio" }
    }
    return { tono: "ok", texto: r.hasPin ? "Contraseña y PIN" : "Solo contraseña" }
  }
  if (!r.hasPin) return { tono: "none", texto: "Sin PIN" }
  if (r.mustChangePin) return { tono: "warn", texto: "PIN por cambiar" }
  return { tono: "ok", texto: "PIN activo" }
}

export function WorkersClient({
  rows,
  domain,
  fichaInicial = null,
  tabInicial = "datos",
}: {
  rows: WorkerRow[]
  domain: string
  /** Ficha que viene abierta desde fuera (Informes enlaza aquí). */
  fichaInicial?: string | null
  tabInicial?: WorkerTab
}) {
  const router = useRouter()
  const [nuevoOpen, setNuevoOpen] = useState(false)
  // Se guarda el id y no la fila para que, tras un refresh, se siga viendo la
  // ficha de quien toca con los datos ya actualizados.
  const [fichaId, setFichaId] = useState<string | null>(fichaInicial)
  const [fichaTab, setFichaTab] = useState<WorkerTab>(tabInicial)
  const [verInactivas, setVerInactivas] = useState(false)

  const ficha = fichaId ? rows.find((r) => r.id === fichaId) ?? null : null

  function abrirFicha(r: WorkerRow, tab: WorkerTab = "datos") {
    setFichaId(r.id)
    setFichaTab(tab)
  }

  if (ficha) {
    return (
      <WorkerProfileView
        worker={ficha}
        domain={domain}
        tab={fichaTab}
        onTabChange={setFichaTab}
        onBack={() => {
          setFichaId(null)
          // Si se llegó con ?ficha= en la URL hay que quitarlo al cerrar; si
          // no, el siguiente refresco volvería a abrir la ficha que se acaba
          // de cerrar.
          if (fichaInicial) router.replace("/workers")
        }}
      />
    )
  }

  // Quien gestiona el centro arriba, el equipo debajo y las bajas al final.
  // Ordenar solo alfabéticamente entrelazaba administradoras y trabajadoras, y
  // el rol —que es lo primero que se lee de una fila— no ordenaba nada.
  const admins = rows.filter((r) => r.active && r.role === "ADMIN")
  const equipo = rows.filter((r) => r.active && r.role !== "ADMIN")
  const inactivas = rows.filter((r) => !r.active)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground">
            {rows.length} usuarios · pulsa una fila para abrir su ficha
          </p>
        </div>
        <Button onClick={() => setNuevoOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      <div className="space-y-6 p-6">
        {rows.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Sin usuarios.</Card>
        )}

        {admins.length > 0 && (
          <GrupoDeUsuarios
            titulo="Administración"
            descripcion="Entran a la gestión del centro con email y contraseña."
            filas={admins}
            onAbrir={abrirFicha}
            onDesactivada={() => setVerInactivas(true)}
          />
        )}

        {equipo.length > 0 && (
          <GrupoDeUsuarios
            titulo="Equipo"
            descripcion="Entran al mostrador con su PIN."
            filas={equipo}
            onAbrir={abrirFicha}
            onDesactivada={() => setVerInactivas(true)}
          />
        )}

        {inactivas.length > 0 && (
          // Plegadas: son las que ya no trabajan aquí. Estaban mezcladas con
          // las demás y solo se distinguían por el interruptor de la derecha.
          <div>
            <button
              type="button"
              onClick={() => setVerInactivas((v) => !v)}
              className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {verInactivas ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Desactivadas ({inactivas.length})
            </button>
            {verInactivas && <TablaDeUsuarios filas={inactivas} onAbrir={abrirFicha} conRol />}
          </div>
        )}
      </div>

      <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <WorkerForm
            worker={null}
            domain={domain}
            onDone={() => setNuevoOpen(false)}
            onCancel={() => setNuevoOpen(false)}
            submitLabel="Crear usuario"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GrupoDeUsuarios({ titulo, descripcion, filas, onAbrir, onDesactivada }: {
  titulo: string
  descripcion: string
  filas: WorkerRow[]
  onAbrir: (r: WorkerRow, tab?: WorkerTab) => void
  onDesactivada: () => void
}) {
  return (
    <div>
      <div className="mb-2">
        <h2 className="text-sm font-semibold">{titulo} ({filas.length})</h2>
        <p className="text-xs text-muted-foreground">{descripcion}</p>
      </div>
      <TablaDeUsuarios filas={filas} onAbrir={onAbrir} onDesactivada={onDesactivada} />
    </div>
  )
}

/**
 * El listado se queda con quién es cada una y cómo está: el resto —informe,
 * PIN, contraseña, editar, borrar— vive dentro de su ficha. Antes eran cinco
 * columnas de iconos con cabeceras de 11px, y la de contraseña salía vacía en
 * toda trabajadora.
 */
function TablaDeUsuarios({ filas, onAbrir, conRol = false, onDesactivada }: {
  filas: WorkerRow[]
  onAbrir: (r: WorkerRow, tab?: WorkerTab) => void
  /** El rol solo se repite donde el grupo no lo dice ya: en las desactivadas. */
  conRol?: boolean
  onDesactivada?: () => void
}) {
  const router = useRouter()

  async function onToggle(r: WorkerRow) {
    const res = await toggleWorkerActive(r.id, !r.active)
    if (res.ok) {
      // Al desactivar, la fila se va al grupo de abajo. Si está plegado
      // desaparece sin más y parece que se ha borrado: se abre para que se vea
      // adónde ha ido.
      if (r.active) onDesactivada?.()
      router.refresh()
    } else toast.error(res.error ?? "Error")
  }

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            {conRol && <TableHead>Rol</TableHead>}
            <TableHead>Email</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Acceso</TableHead>
            <TableHead className="w-24 text-center">Activo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((r) => {
            const acceso = resumenAcceso(r)
            return (
              <TableRow
                key={r.id}
                onClick={() => onAbrir(r)}
                className={cn("cursor-pointer", !r.active && "opacity-60")}
              >
                <TableCell className="font-medium">
                  <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: r.color }} />
                  {r.lastName ? `${r.lastName}, ${r.name}` : r.name}
                </TableCell>
                {conRol && (
                  <TableCell>
                    <Badge variant={r.role === "ADMIN" ? "default" : "secondary"}>
                      {r.role === "ADMIN" ? "Administrador" : "Trabajador"}
                    </Badge>
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.phone ?? "—"}</TableCell>
                <TableCell>
                  <EstadoAcceso tono={acceso.tono} texto={acceso.texto} />
                </TableCell>
                {/* El interruptor no abre la ficha: se usa de pasada desde el
                    listado y un clic aquí no debería cambiarte de pantalla. */}
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  <Switch checked={r.active} onCheckedChange={() => onToggle(r)} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}
