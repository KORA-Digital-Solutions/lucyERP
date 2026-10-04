import { AlertTriangle, ChevronRight } from "lucide-react"
import { toTimeString } from "@/lib/format"
import { STATUS_META, type AppointmentStatus } from "@/lib/enums"

export type UpcomingAppointment = {
  id: string
  startAt: Date
  status: string
  customerName: string
  serviceName: string
  workerName: string
  /** Nota de la propia cita, no de la ficha. */
  appointmentNotes: string | null
  allergies: string | null
  /** Observaciones de la ficha del cliente. */
  customerNotes: string | null
  /** Lo último que se le hizo, o null si todavía no ha tenido ninguna cita realizada. */
  lastVisit: { at: Date; serviceName: string } | null
}

/**
 * Una cita del panel de inicio. Cerrada es lo de siempre —cuándo, quién, qué y
 * con quién—; abierta dice lo que conviene saber antes de que la clienta se
 * siente: qué se le hizo la última vez, sus alergias y las observaciones de su
 * ficha. Las alergias se avisan también con la fila cerrada, porque es lo único
 * que no se puede ver tarde.
 *
 * Es un `<details>` y no un componente de cliente: abrir y cerrar no necesita
 * estado, y así el panel sigue siendo todo servidor.
 */
export function UpcomingAppointmentRow({ a }: { a: UpcomingAppointment }) {
  const meta = STATUS_META[a.status as AppointmentStatus] ?? STATUS_META.PENDING

  return (
    <details className="group rounded-lg transition-colors hover:bg-muted/50 open:bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center gap-4 p-3 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <div className="w-20 shrink-0 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {a.startAt.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
          </span>
          <br />
          {toTimeString(a.startAt)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{a.customerName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {a.serviceName} · {a.workerName}
          </p>
        </div>
        {a.allergies && (
          <span
            title="Tiene alergias apuntadas: ábrela para verlas"
            className="flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
          >
            <AlertTriangle className="h-3 w-3" /> Alergias
          </span>
        )}
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${meta.className}`}>{meta.label}</span>
      </summary>

      <dl className="space-y-2 px-3 pb-3 pl-11 text-xs">
        <Dato titulo="Última visita">
          {a.lastVisit
            ? `${a.lastVisit.at.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })} · ${a.lastVisit.serviceName}`
            : "Primera visita: todavía no tiene ninguna cita realizada."}
        </Dato>
        <Dato titulo="Alergias" aviso={!!a.allergies}>{a.allergies ?? "Ninguna apuntada."}</Dato>
        <Dato titulo="Observaciones">{a.customerNotes ?? "Sin observaciones en la ficha."}</Dato>
        {a.appointmentNotes && <Dato titulo="Nota de la cita">{a.appointmentNotes}</Dato>}
      </dl>
    </details>
  )
}

function Dato({ titulo, aviso = false, children }: { titulo: string; aviso?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground">{titulo}</dt>
      <dd className={aviso ? "whitespace-pre-line font-medium text-amber-800" : "whitespace-pre-line text-foreground"}>
        {children}
      </dd>
    </div>
  )
}
