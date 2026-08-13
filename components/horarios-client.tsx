"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { VacationsSection, type BalanceRow, type LeaveRow } from "@/components/vacations-client"

interface Props {
  workers: (WorkerOption & { color?: string })[]
  clinicWeekly: WeeklyDay[]
  workerWeeklyByWorker: Record<string, WeeklyDay[]>
  weekDates: string[]
  weekStart: string
  clinicWeekCells: ClinicDayCell[]
  workerWeekCellsByWorker: Record<string, WorkerDayCell[]>
  clinicOverrides: OverrideRow[]
  workerOverrides: OverrideRow[]
  weekLeaves: LeaveRow[]
  vacationYear: number
  vacationBalances: BalanceRow[]
  holidays: HolidayRow[]
}

// Sección plegable reutilizada para "Horario base" / "Festivos" / "Vacaciones":
// todo vive en esta misma pantalla ahora, sin pestañas — solo se pliega lo
// que no hace falta ver a diario.
function CollapsibleSection({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string
  description: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t p-4">{children}</div>}
    </div>
  )
}

export function HorariosClient({
  workers,
  clinicWeekly,
  workerWeeklyByWorker,
  weekDates,
  weekStart,
  clinicWeekCells,
  workerWeekCellsByWorker,
  clinicOverrides,
  workerOverrides,
  weekLeaves,
  vacationYear,
  vacationBalances,
  holidays,
}: Props) {
  const router = useRouter()
  // Ámbito seleccionado (Centro o una empleada), compartido por el editor de
  // horario base para no tener que reelegirlo.
  const [scope, setScope] = useState<Scope>({ type: "CLINIC" })
  const [openSection, setOpenSection] = useState<"base" | "holidays" | "vacations" | null>(null)
  const [hideWeekends, setHideWeekends] = useState(true)
  useEffect(() => {
    const stored = localStorage.getItem("agenda:hideWeekends")
    if (stored !== null) setHideWeekends(stored === "true")
  }, [])
  function toggleHideWeekends(v: boolean) {
    setHideWeekends(v)
    localStorage.setItem("agenda:hideWeekends", String(v))
  }
  function toggleSection(section: "base" | "holidays" | "vacations") {
    setOpenSection((prev) => (prev === section ? null : section))
  }

  // Clic en una celda de la vista semanal → panel lateral, igual que en
  // Agenda, ya cargado con esa empleada (o centro) y esa fecha. Desde ahí se
  // gestiona todo: franjas, festivos y vacaciones — ya no hacen falta
  // pestañas aparte.
  const [editingCell, setEditingCell] = useState<{ scope: Scope; date: string } | null>(null)

  function goToWeek(offset: number) {
    const [y, m, d] = weekStart.split("-").map(Number)
    const nd = new Date(y, m - 1, d + offset * 7)
    const iso = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`
    router.push(`/horarios?week=${iso}`)
  }
  function goToday() {
    router.push(`/horarios`)
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Horarios</h1>
        <p className="text-muted-foreground">
          Horario semanal, excepciones, vacaciones y festivos — todo desde aquí.
        </p>
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1 space-y-6">
          <div className="space-y-4">
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
              <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                <Label htmlFor="hide-weekends-horarios" className="text-xs font-normal text-muted-foreground">
                  Ocultar fines de semana
                </Label>
                <Switch id="hide-weekends-horarios" checked={hideWeekends} onCheckedChange={toggleHideWeekends} />
              </div>
            </div>

            <WeeklyScheduleGrid
              dates={visibleDates}
              clinicCells={visibleClinicCells}
              workers={workers}
              workerCellsByWorker={visibleWorkerCells}
              onCellClick={(clickedScope, date) => setEditingCell({ scope: clickedScope, date })}
            />

            <OverridesHistoryTable
              clinicOverrides={clinicOverrides}
              workerOverrides={workerOverrides}
              onEdit={(clickedScope, date) => setEditingCell({ scope: clickedScope, date })}
            />
          </div>

          <div className="space-y-3">
            <CollapsibleSection
              title="Horario base (semana tipo)"
              description="El horario que se repite cada semana automáticamente. Los cambios puntuales se hacen arriba, en la cuadrícula."
              open={openSection === "base"}
              onToggle={() => toggleSection("base")}
            >
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
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Festivos"
              description="Calendario de festivos por año, importación masiva y copia de festivos fijos."
              open={openSection === "holidays"}
              onToggle={() => toggleSection("holidays")}
            >
              <HolidaysTab holidays={holidays} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Vacaciones"
              description="Saldos anuales por empleada y asignación de días libres en rango."
              open={openSection === "vacations"}
              onToggle={() => toggleSection("vacations")}
            >
              <VacationsSection
                year={vacationYear}
                workers={workers}
                balances={vacationBalances}
              />
            </CollapsibleSection>
          </div>
        </div>

        {editingCell && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setEditingCell(null)}
            aria-hidden="true"
          />
        )}
        {editingCell && (
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l bg-card shadow-xl lg:static lg:z-auto lg:w-[400px] lg:max-w-none lg:shadow-none">
            <OverridesPanel
              key={scopeKey(editingCell.scope) + ":" + editingCell.date}
              scope={editingCell.scope}
              clinicWeekly={clinicWeekly}
              workerWeekly={editingCell.scope.type === "WORKER" ? (workerWeeklyByWorker[editingCell.scope.workerId] ?? []) : []}
              clinicOverrides={clinicOverrides}
              workerOverrides={workerOverrides}
              holidays={holidays}
              leaves={weekLeaves}
              initialDate={editingCell.date}
              onClose={() => setEditingCell(null)}
            />
          </aside>
        )}
      </div>
    </div>
  )
}
