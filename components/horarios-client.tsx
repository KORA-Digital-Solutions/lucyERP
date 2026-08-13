"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { saveClinicWeeklySchedule, saveWorkerWeeklySchedule } from "@/lib/actions"
import type { ClinicDayCell, WorkerDayCell } from "@/lib/schedule"
import {
  WeeklyScheduleEditor,
  ScopeList,
  OverridesPanel,
  OverridesHistoryTable,
  HolidaysTab,
  scopeKey,
  type Scope,
  type WeeklyDay,
  type OverrideRow,
  type HolidayRow,
  type WorkerOption,
} from "@/components/schedules-client"
import { WeeklyScheduleGrid } from "@/components/weekly-schedule-grid"
import {
  BalanceCards,
  LeaveRangeForm,
  AbsencesTable,
  groupLeaves,
  type BalanceRow,
  type LeaveRow,
  type LeaveGroup,
} from "@/components/vacations-client"

type HorariosTab = "schedule" | "overrides" | "absences" | "base" | "holidays"

// Todo se gestiona desde una celda empleada/día de "Esta semana": el panel
// lateral abre sobre ese ámbito y esa fecha, y dentro se elige si lo que se
// va a tocar es el horario de ese día o una ausencia. `editingLeave` está
// puesto cuando el día ya tiene una ausencia guardada (se edita el bloque
// entero, no solo ese día).
type PanelMode = "override" | "leave"
type PanelState = { scope: Scope; date: string; mode: PanelMode; editingLeave?: LeaveGroup } | null

function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + (dt.getDay() === 0 ? -6 : 1 - dt.getDay()))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

interface Props {
  workers: (WorkerOption & { color?: string })[]
  clinicWeekly: WeeklyDay[]
  workerWeeklyByWorker: Record<string, WeeklyDay[]>
  weekDates: string[]
  weekStart: string
  today: string
  clinicWeekCells: ClinicDayCell[]
  workerWeekCellsByWorker: Record<string, WorkerDayCell[]>
  clinicOverrides: OverrideRow[]
  workerOverrides: OverrideRow[]
  weekLeaves: LeaveRow[]
  yearLeaves: LeaveRow[]
  vacationYear: number
  vacationBalances: BalanceRow[]
  holidays: HolidayRow[]
  initialTab: HorariosTab
}

export function HorariosClient({
  workers,
  clinicWeekly,
  workerWeeklyByWorker,
  weekDates,
  weekStart,
  today,
  clinicWeekCells,
  workerWeekCellsByWorker,
  clinicOverrides,
  workerOverrides,
  weekLeaves,
  yearLeaves,
  vacationYear,
  vacationBalances,
  holidays,
  initialTab,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<HorariosTab>(initialTab)
  // Ámbito seleccionado (Centro o una empleada), compartido por el editor de
  // horario base para no tener que reelegirlo.
  const [scope, setScope] = useState<Scope>({ type: "CLINIC" })
  const [hideWeekends, setHideWeekends] = useState(true)
  useEffect(() => {
    const stored = localStorage.getItem("agenda:hideWeekends")
    if (stored !== null) setHideWeekends(stored === "true")
  }, [])
  function toggleHideWeekends(v: boolean) {
    setHideWeekends(v)
    localStorage.setItem("agenda:hideWeekends", String(v))
  }

  // Clic en una celda de la vista semanal → panel lateral, igual que en
  // Agenda, ya cargado con esa empleada (o centro) y esa fecha.
  const [panel, setPanel] = useState<PanelState>(null)

  const holidayDates = holidays.map((h) => h.date)

  // La ausencia de un día concreto, resuelta al bloque continuo al que
  // pertenece: se edita el rango entero, que es como se creó.
  function leaveGroupFor(workerId: string, date: string): LeaveGroup | undefined {
    const leave = yearLeaves.find((l) => l.workerId === workerId && l.date === date)
    if (!leave) return undefined
    return groupLeaves(yearLeaves, holidayDates).find((g) => g.ids.includes(leave.id))
  }

  // Si el día ya es vacaciones/baja, el panel abre directamente en Ausencia:
  // es lo que el usuario está viendo en la celda y casi seguro lo que viene a
  // tocar. En cualquier otro caso, en horario.
  function openDay(scope: Scope, date: string) {
    const group = scope.type === "WORKER" ? leaveGroupFor(scope.workerId, date) : undefined
    setPanel({ scope, date, mode: group ? "leave" : "override", editingLeave: group })
  }

  // Cambio de pestaña dentro del panel, sin perder ámbito ni fecha.
  function setPanelMode(mode: PanelMode) {
    setPanel((p) => {
      if (!p) return p
      const group = mode === "leave" && p.scope.type === "WORKER" ? leaveGroupFor(p.scope.workerId, p.date) : undefined
      return { ...p, mode, editingLeave: group }
    })
  }

  // El ojo de las pestañas de consulta: salta a "Esta semana" en la semana de
  // esa fecha y deja el panel abierto sobre la fila correspondiente.
  function viewInWeek(scope: Scope, date: string, mode: PanelMode, editingLeave?: LeaveGroup) {
    setActiveTab("schedule")
    setPanel({ scope, date, mode, editingLeave })
    const monday = mondayOf(date)
    router.push(`/horarios?tab=schedule&week=${monday}`)
  }

  function goToWeek(offset: number) {
    const [y, m, d] = weekStart.split("-").map(Number)
    const nd = new Date(y, m - 1, d + offset * 7)
    const iso = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`
    router.push(`/horarios?tab=schedule&week=${iso}`)
  }
  function goToday() {
    router.push(`/horarios?tab=schedule`)
  }

  const visibleIndices = weekDates
    .map((d, i) => i)
    .filter((i) => !hideWeekends || (i !== 5 && i !== 6))
  const visibleDates = visibleIndices.map((i) => weekDates[i])
  const visibleClinicCells = visibleIndices.map((i) => clinicWeekCells[i])
  const visibleWorkerCells: Record<string, WorkerDayCell[]> = {}
  for (const w of workers) {
    const cells = workerWeekCellsByWorker[w.id] ?? []
    visibleWorkerCells[w.id] = visibleIndices.map((i) => cells[i])
  }

  return (
    // Mismo esqueleto que Clientes: cabecera a todo lo ancho y, debajo, la fila
    // contenido + panel. Así el panel lateral arranca justo bajo la cabecera y
    // ocupa todo el alto, en vez de flotar dentro del contenido.
    <div className="flex h-screen flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Horarios</h1>
          <p className="text-muted-foreground">Horario semanal, excepciones, vacaciones y festivos.</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-auto p-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as HorariosTab)}>
            <TabsList>
              <TabsTrigger value="schedule">Esta semana</TabsTrigger>
              <TabsTrigger value="overrides">Excepciones puntuales</TabsTrigger>
              <TabsTrigger value="absences">Ausencias</TabsTrigger>
              <TabsTrigger value="base">Gestión de horario base</TabsTrigger>
              <TabsTrigger value="holidays">Festivos</TabsTrigger>
            </TabsList>

            <TabsContent value="schedule" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center rounded-lg border bg-card">
                  <Button variant="ghost" size="sm" onClick={() => goToWeek(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={goToday}>
                    Esta semana
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => goToWeek(1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                    <Label htmlFor="hide-weekends-horarios" className="text-xs font-normal text-muted-foreground">
                      Ocultar fines de semana
                    </Label>
                    <Switch id="hide-weekends-horarios" checked={hideWeekends} onCheckedChange={toggleHideWeekends} />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Haz clic en la casilla de una fecha (del centro o de una empleada). Desde el panel eliges si cambias el
                horario de ese día o le asignas una ausencia (vacaciones, baja…), que puede ser de un día o de un rango.
              </p>

              <WeeklyScheduleGrid
                dates={visibleDates}
                clinicCells={visibleClinicCells}
                workers={workers}
                workerCellsByWorker={visibleWorkerCells}
                onCellClick={openDay}
              />

              <BalanceCards year={vacationYear} balances={vacationBalances} workers={workers} />
            </TabsContent>

            <TabsContent value="overrides">
              <OverridesHistoryTable
                workers={workers}
                clinicOverrides={clinicOverrides}
                workerOverrides={workerOverrides}
                today={today}
                onView={(scope, date) => viewInWeek(scope, date, "override")}
              />
            </TabsContent>

            <TabsContent value="absences">
              <AbsencesTable
                workers={workers}
                leaves={yearLeaves}
                holidayDates={holidayDates}
                today={today}
                onView={(group) =>
                  viewInWeek(
                    { type: "WORKER", workerId: group.workerId, workerName: group.workerName },
                    group.startDate,
                    "leave",
                    group,
                  )
                }
              />
            </TabsContent>

            <TabsContent value="base">
              <div className="flex gap-6">
                <ScopeList workers={workers} selectedKey={scopeKey(scope)} onSelect={setScope} />
                <div className="min-w-0 flex-1">
                  <Card className="overflow-hidden p-0">
                    <div className={cn("px-6 py-5", scope.type === "CLINIC" ? "bg-accent" : "border-b")}>
                      <CardTitle className={cn(scope.type === "CLINIC" && "text-accent-foreground")}>
                        {scope.type === "CLINIC" ? "Horario semanal del centro" : `Horario semanal · ${scope.workerName}`}
                      </CardTitle>
                      <CardDescription className={cn("mt-1", scope.type === "CLINIC" && "text-accent-foreground/70")}>
                        {scope.type === "CLINIC"
                          ? "Apertura/cierre por día. Admite horario partido (varias franjas por día)."
                          : "Días y franjas en las que trabaja según su contrato."}
                      </CardDescription>
                    </div>
                    <CardContent className="py-6">
                      {scope.type === "CLINIC" ? (
                        <WeeklyScheduleEditor key="CLINIC" initialDays={clinicWeekly} onSave={saveClinicWeeklySchedule} />
                      ) : (
                        <WeeklyScheduleEditor
                          key={scope.workerId}
                          initialDays={workerWeeklyByWorker[scope.workerId] ?? []}
                          onSave={(days) => saveWorkerWeeklySchedule(scope.workerId, days)}
                          emptyLabel="No trabaja"
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="holidays">
              <HolidaysTab holidays={holidays} />
            </TabsContent>
          </Tabs>
        </div>

        {panel && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setPanel(null)}
            aria-hidden="true"
          />
        )}
        {panel && (
          <aside
            className={cn(
              "flex w-full flex-col border-l bg-card shadow-xl",
              "fixed inset-y-0 right-0 z-50 max-w-md",
              "lg:static lg:z-auto lg:w-[420px] lg:max-w-none lg:shadow-none",
            )}
          >
            {/* Cabecera del panel con el mismo formato que Clientes: título,
                subtítulo y cerrar. Los formularios de dentro ya no traen la
                suya para no duplicar. */}
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">
                  {panel.scope.type === "CLINIC" ? "Centro" : panel.scope.workerName}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {panel.mode === "override"
                    ? "Cambios de un día concreto. El horario base semanal no se toca."
                    : "Un día o un rango. Bloquea la agenda esos días."}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setPanel(null)} aria-label="Cerrar panel">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Qué se va a gestionar de ese día. Solo para empleadas: el centro
                no tiene vacaciones ni bajas, sus días especiales son festivos
                y se resuelven dentro del formulario de horario. */}
            {panel.scope.type === "WORKER" && (
              <div className="grid grid-cols-2 gap-1.5 border-b px-5 py-3">
                {([
                  { value: "override", label: "Cambio de horario" },
                  { value: "leave", label: "Ausencia" },
                ] as const).map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setPanelMode(m.value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                      panel.mode === m.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {panel.mode === "override" ? (
                <OverridesPanel
                  key={scopeKey(panel.scope) + ":" + panel.date}
                  scope={panel.scope}
                  clinicWeekly={clinicWeekly}
                  workerWeekly={panel.scope.type === "WORKER" ? (workerWeeklyByWorker[panel.scope.workerId] ?? []) : []}
                  clinicOverrides={clinicOverrides}
                  workerOverrides={workerOverrides}
                  holidays={holidays}
                  // Del año, no solo de la semana visible: dentro del panel se
                  // puede cambiar la fecha y hay que seguir detectando ausencias.
                  leaves={yearLeaves}
                  initialDate={panel.date}
                  onClose={() => setPanel(null)}
                  onManageLeave={() => setPanelMode("leave")}
                />
              ) : (
                <LeaveRangeForm
                  key={(panel.editingLeave?.ids[0] ?? "new") + ":" + panel.date}
                  workers={workers}
                  defaultWorkerId={panel.scope.type === "WORKER" ? panel.scope.workerId : undefined}
                  defaultDate={panel.date}
                  editing={panel.editingLeave}
                  onClose={() => setPanel(null)}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
