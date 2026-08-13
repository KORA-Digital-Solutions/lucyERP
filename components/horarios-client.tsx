"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
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

// El panel lateral derecho sirve para tres cosas: el detalle de un día (clic
// en una celda de la cuadrícula), el alta de una ausencia, o la edición de
// una ausencia ya existente.
type PanelState =
  | { kind: "day"; scope: Scope; date: string }
  | { kind: "leave"; editing?: LeaveGroup }
  | null

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

  // Clic en una celda de la vista semanal (o en una fila del historial de
  // excepciones) → panel lateral, igual que en Agenda, ya cargado con esa
  // empleada (o centro) y esa fecha. El botón "Asignar ausencias" reutiliza
  // esa misma ranura con el formulario de rango.
  const [panel, setPanel] = useState<PanelState>(null)
  const openDay = (scope: Scope, date: string) => setPanel({ kind: "day", scope, date })

  function goToWeek(offset: number) {
    const [y, m, d] = weekStart.split("-").map(Number)
    const nd = new Date(y, m - 1, d + offset * 7)
    const iso = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`
    router.push(`/horarios?tab=schedule&week=${iso}`)
  }
  function goToday() {
    router.push(`/horarios?tab=schedule`)
  }

  const holidayDates = holidays.map((h) => h.date)

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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Horarios</h1>
        <p className="text-muted-foreground">Horario semanal, excepciones, vacaciones y festivos.</p>
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
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
                  <Button size="sm" onClick={() => setPanel({ kind: "leave" })}>
                    <Plus className="mr-1.5 h-4 w-4" /> Asignar ausencias
                  </Button>
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                    <Label htmlFor="hide-weekends-horarios" className="text-xs font-normal text-muted-foreground">
                      Ocultar fines de semana
                    </Label>
                    <Switch id="hide-weekends-horarios" checked={hideWeekends} onCheckedChange={toggleHideWeekends} />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Para cambiar el turno de un día, haz clic en la casilla de esa fecha (del centro o de la empleada).
                Para vacaciones, bajas y demás ausencias, usa{" "}
                <button
                  type="button"
                  onClick={() => setPanel({ kind: "leave" })}
                  className="text-primary hover:underline"
                >
                  Asignar ausencias
                </button>
                .
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
                onEdit={openDay}
              />
            </TabsContent>

            <TabsContent value="absences">
              <AbsencesTable
                workers={workers}
                leaves={yearLeaves}
                holidayDates={holidayDates}
                today={today}
                onEdit={(group) => setPanel({ kind: "leave", editing: group })}
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
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l bg-card shadow-xl lg:static lg:z-auto lg:w-[400px] lg:max-w-none lg:shadow-none">
            {panel.kind === "day" ? (
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
                onManageLeave={(leave) => {
                  const group = groupLeaves(yearLeaves, holidayDates).find((g) => g.ids.includes(leave.id))
                  if (group) setPanel({ kind: "leave", editing: group })
                }}
              />
            ) : (
              <LeaveRangeForm
                key={panel.editing?.ids[0] ?? "new"}
                workers={workers}
                editing={panel.editing}
                onClose={() => setPanel(null)}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
