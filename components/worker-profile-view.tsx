"use client"

/**
 * Ficha de empleada: todo lo que hay que saber de una persona, en un sitio.
 *
 * Es el mismo esqueleto que la ficha del cliente (cabecera + pestañas), y a
 * propósito: en esta casa una persona se abre siempre igual. Antes esto no
 * existía y cada cosa colgaba de un icono distinto de la tabla —el informe
 * ocupaba la pantalla entera desde un botón de 16px, y el PIN y la contraseña
 * vivían en dos diálogos cuyas explicaciones solo se leían si los abrías.
 *
 * Las tres pestañas responden a las tres preguntas que se le hacen a una
 * empleada: quién es (Datos), qué hace (Actividad) y cómo entra (Acceso).
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Clock, Hash, KeyRound, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { clearUserPin, deleteWorker, generateUserPin, setUserPassword } from "@/lib/actions"
import { WorkerForm } from "@/components/worker-form"
import { WorkerReportView } from "@/components/worker-report-view"
import type { WorkerRow } from "@/components/workers-client"

export type WorkerTab = "datos" | "actividad" | "acceso"

const TABS: { key: WorkerTab; label: string }[] = [
  { key: "datos",     label: "Datos" },
  { key: "actividad", label: "Actividad" },
  { key: "acceso",    label: "Acceso" },
]

export function WorkerProfileView({
  worker,
  domain,
  tab,
  onTabChange,
  onBack,
}: {
  worker: WorkerRow
  domain: string
  tab: WorkerTab
  onTabChange: (t: WorkerTab) => void
  onBack: () => void
}) {
  const fullName = worker.lastName ? `${worker.lastName}, ${worker.name}` : worker.name

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b bg-background">
        <div className="flex items-start gap-4 px-6 pb-2 pt-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="mt-0.5 shrink-0 gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ficha de empleada
            </p>
            <h1 className="flex items-center gap-2 text-xl font-semibold leading-tight">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: worker.color }}
              />
              {fullName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <Badge variant={worker.role === "ADMIN" ? "default" : "secondary"} className="py-0 text-xs">
                {worker.role === "ADMIN" ? "Administrador" : "Trabajador"}
              </Badge>
              {!worker.active && <span>Desactivada</span>}
              {worker.email && <span>{worker.email}</span>}
              {worker.phone && <span className="tabular-nums">{worker.phone}</span>}
            </div>
          </div>
          {/* El horario se gestiona en su propia pantalla; desde aquí al menos
              se sabe que existe y dónde está. */}
          <Button asChild variant="outline" size="sm" className="mt-0.5 shrink-0 gap-1.5">
            <Link href="/horarios?tab=base"><Clock className="h-4 w-4" /> Ver horarios</Link>
          </Button>
        </div>

        <div className="flex gap-0 px-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={cn(
                "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === "datos" && <DatosTab worker={worker} domain={domain} onDeleted={onBack} />}
        {tab === "actividad" && <WorkerReportView worker={worker} />}
        {tab === "acceso" && <AccesoTab worker={worker} />}
      </div>
    </div>
  )
}

/* ─── Datos ──────────────────────────────────────────────────────────────── */

function DatosTab({ worker, domain, onDeleted }: {
  worker: WorkerRow
  domain: string
  onDeleted: () => void
}) {
  const router = useRouter()
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  async function onDelete() {
    const res = await deleteWorker(worker.id)
    if (res.ok) {
      toast.success("Usuario eliminado.")
      setConfirmarBorrado(false)
      router.refresh()
      onDeleted()
    } else toast.error(res.error ?? "Error al eliminar.")
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Datos de la empleada</CardTitle>
        </CardHeader>
        <CardContent>
          {/* La key remonta el formulario al cambiar de persona: si no, los
              campos no controlados se quedan con los datos de la anterior. */}
          <WorkerForm key={worker.id} worker={worker} domain={domain} onDone={() => {}} />
        </CardContent>
      </Card>

      {/* La regla "solo se borra lo desactivado" ya existía, pero se aplicaba
          escondiendo el botón: quien lo buscaba no lo encontraba y no sabía
          por qué. Aquí está siempre, apagado y con el motivo al lado. */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base">Eliminar usuario</CardTitle>
          <CardDescription>
            {worker.active
              ? "Solo se pueden eliminar usuarios desactivados. Desactívala arriba si de verdad quieres borrarla."
              : "Se borra para siempre y no se puede deshacer. Si solo quieres que deje de trabajar, basta con tenerla desactivada."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={worker.active}
            onClick={() => setConfirmarBorrado(true)}
          >
            <Trash2 className="h-4 w-4" /> Eliminar usuario
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmarBorrado} onOpenChange={setConfirmarBorrado}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente a <strong>{worker.name} {worker.lastName}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ─── Acceso ─────────────────────────────────────────────────────────────── */

/**
 * Las dos puertas del centro, una debajo de otra y explicadas donde se usan.
 * El PIN abre el mostrador; la contraseña, la gestión. Una administradora que
 * además atiende tiene las dos: no son alternativas.
 */
function AccesoTab({ worker }: { worker: WorkerRow }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  // El PIN recién generado, para poder dictárselo. Se enseña una sola vez: en
  // la base solo queda el hash, igual que con una contraseña.
  const [pinGenerado, setPinGenerado] = useState<string | null>(null)
  const [retirarPin, setRetirarPin] = useState(false)
  const [tempPw, setTempPw] = useState("")

  const nombre = worker.name

  async function onGeneratePin() {
    setLoading(true)
    const res = await generateUserPin(worker.id)
    setLoading(false)
    if (res.ok && res.pin) {
      setPinGenerado(res.pin)
      router.refresh()
    } else toast.error(res.error ?? "Error al generar el PIN.")
  }

  async function onClearPin() {
    setLoading(true)
    const res = await clearUserPin(worker.id)
    setLoading(false)
    setRetirarPin(false)
    if (res.ok) {
      toast.success("PIN retirado.")
      setPinGenerado(null)
      router.refresh()
    } else toast.error(res.error ?? "Error al retirar el PIN.")
  }

  async function onSetPassword() {
    if (tempPw.length < 6) return
    setLoading(true)
    const res = await setUserPassword(worker.id, tempPw)
    setLoading(false)
    if (res.ok) {
      toast.success("Contraseña temporal asignada. Tendrá que cambiarla en el próximo acceso.")
      setTempPw("")
      router.refresh()
    } else toast.error(res.error ?? "Error al asignar contraseña.")
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── PIN de mostrador ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hash className="h-4 w-4" /> PIN de mostrador
          </CardTitle>
          <CardDescription>
            Con este PIN <strong>{nombre}</strong> abre el mostrador y firma sus cobros.
            No abre la gestión del centro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <EstadoAcceso
            tono={!worker.hasPin ? "none" : worker.mustChangePin ? "warn" : "ok"}
            texto={!worker.hasPin ? "Sin PIN" : worker.mustChangePin ? "PIN por cambiar" : "PIN activo"}
          />

          {pinGenerado ? (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-dashed bg-muted/30 py-6 text-center">
                <p className="text-4xl font-bold tracking-[0.3em] tabular-nums">{pinGenerado}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Anótalo o díselo ahora: no se vuelve a mostrar. Al entrar por primera vez
                tendrá que cambiarlo por uno suyo.
              </p>
              <Button variant="outline" onClick={() => setPinGenerado(null)}>Hecho</Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {worker.hasPin
                  ? "Si generas uno nuevo, el anterior deja de servir."
                  : "El sistema genera un PIN al azar. Es de un solo uso: ella elegirá el suyo al entrar."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={onGeneratePin} disabled={loading}>
                  {loading ? "Generando…" : worker.hasPin ? "Generar uno nuevo" : "Generar PIN"}
                </Button>
                {worker.hasPin && (
                  <Button variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => setRetirarPin(true)} disabled={loading}>
                    Retirar PIN
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Contraseña de gestión ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> Contraseña de gestión
          </CardTitle>
          <CardDescription>
            Abre la gestión del centro: informes, usuarios, horarios y configuración.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {worker.role !== "ADMIN" ? (
            // Antes esta celda salía vacía en la tabla y no explicaba nada.
            <p className="text-sm text-muted-foreground">
              Las trabajadoras no entran por la gestión del centro, así que no necesitan
              contraseña. Si <strong>{nombre}</strong> tiene que gestionar, cámbiale el rol
              a Administrador en la pestaña <strong>Datos</strong>.
            </p>
          ) : !worker.email ? (
            <p className="text-sm text-muted-foreground">
              Le falta el email: es el usuario con el que se entra. Ponlo en la pestaña{" "}
              <strong>Datos</strong> y vuelve aquí.
            </p>
          ) : (
            <>
              <EstadoAcceso
                tono={!worker.hasPassword ? "none" : worker.mustChangePassword ? "warn" : "ok"}
                texto={
                  !worker.hasPassword ? "Sin contraseña"
                    : worker.mustChangePassword ? "Contraseña por cambiar"
                      : "Contraseña activa"
                }
              />
              <div className="space-y-2">
                <Label htmlFor="tempPw">Contraseña temporal</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="tempPw" type="text" autoComplete="off"
                    className="max-w-xs"
                    placeholder="Mínimo 6 caracteres"
                    value={tempPw}
                    onChange={(e) => setTempPw(e.target.value)}
                  />
                  <Button onClick={onSetPassword} disabled={loading || tempPw.length < 6}>
                    {loading ? "Guardando…" : "Asignar contraseña"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Se le pedirá que la cambie por una suya en el siguiente acceso.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={retirarPin} onOpenChange={setRetirarPin}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar el PIN?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{nombre}</strong> dejará de poder abrir el mostrador y de firmar cobros
              hasta que se le genere uno nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onClearPin} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Retirar PIN
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const TONOS = {
  ok:   "bg-[#E6F4EA] border-[#34A853] text-[#1E6B34]",
  warn: "bg-[#FEF3E2] border-[#F59E0B] text-[#92400E]",
  none: "bg-muted border-border text-muted-foreground",
} as const

/** El estado de una credencial, con los mismos colores que usan los informes. */
export function EstadoAcceso({ tono, texto }: { tono: keyof typeof TONOS; texto: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", TONOS[tono])}>
      <ShieldCheck className="h-3.5 w-3.5" /> {texto}
    </span>
  )
}
