"use client"

import { useState } from "react"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { saveClinicWeeklySchedule, saveWorkerWeeklySchedule } from "@/lib/actions"
import {
  WeeklyScheduleEditor,
  ScopeList,
  OverridesPanel,
  HolidaysTab,
  scopeKey,
  type Scope,
  type WeeklyDay,
  type OverrideRow,
  type HolidayRow,
  type WorkerOption,
} from "@/components/schedules-client"
import { VacationsSection, type BalanceRow, type LeaveRow } from "@/components/vacations-client"

type HorariosTab = "schedule" | "overrides" | "vacations" | "holidays"

interface Props {
  workers: (WorkerOption & { color?: string })[]
  clinicWeekly: WeeklyDay[]
  workerWeeklyByWorker: Record<string, WeeklyDay[]>
  clinicOverrides: OverrideRow[]
  workerOverrides: OverrideRow[]
  vacationYear: number
  vacationBalances: BalanceRow[]
  vacationLeaves: LeaveRow[]
  holidays: HolidayRow[]
  initialTab: HorariosTab
}

export function HorariosClient({
  workers,
  clinicWeekly,
  workerWeeklyByWorker,
  clinicOverrides,
  workerOverrides,
  vacationYear,
  vacationBalances,
  vacationLeaves,
  holidays,
  initialTab,
}: Props) {
  const [activeTab, setActiveTab] = useState<HorariosTab>(initialTab)
  // Ámbito seleccionado (Centro o una empleada), compartido entre "Horario
  // semanal" y "Excepciones puntuales" para no tener que reelegirlo al
  // cambiar de pestaña.
  const [scope, setScope] = useState<Scope>({ type: "CLINIC" })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Horarios</h1>
        <p className="text-muted-foreground">Horario semanal, excepciones puntuales, vacaciones y festivos.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as HorariosTab)}>
        <TabsList>
          <TabsTrigger value="schedule">Horario semanal</TabsTrigger>
          <TabsTrigger value="overrides">Excepciones puntuales</TabsTrigger>
          <TabsTrigger value="vacations">Vacaciones</TabsTrigger>
          <TabsTrigger value="holidays">Festivos</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
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
        </TabsContent>

        <TabsContent value="overrides">
          <div className="flex gap-6">
            <ScopeList workers={workers} selectedKey={scopeKey(scope)} onSelect={setScope} />
            <OverridesPanel
              key={scopeKey(scope)}
              scope={scope}
              clinicWeekly={clinicWeekly}
              workerWeekly={scope.type === "WORKER" ? (workerWeeklyByWorker[scope.workerId] ?? []) : []}
              clinicOverrides={clinicOverrides}
              workerOverrides={workerOverrides}
              onGoToVacations={() => setActiveTab("vacations")}
            />
          </div>
        </TabsContent>

        <TabsContent value="vacations">
          <VacationsSection
            year={vacationYear}
            workers={workers}
            balances={vacationBalances}
            leaves={vacationLeaves}
          />
        </TabsContent>

        <TabsContent value="holidays">
          <HolidaysTab holidays={holidays} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
