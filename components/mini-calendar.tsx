"use client"

import { useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const DAYS_ES = ["L", "M", "X", "J", "V", "S", "D"]

function parseDateStr(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number)
  return [y, m, d]
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

function firstDayOfWeek(y: number, m: number): number {
  const dow = new Date(y, m - 1, 1).getDay()
  return dow === 0 ? 6 : dow - 1
}

interface Props {
  date: string
  longDate: string
  onSelect: (date: string) => void
}

export function MiniCalendar({ date, longDate, onSelect }: Props) {
  const [y, m] = parseDateStr(date)
  const [viewYear, setViewYear] = useState(y)
  const [viewMonth, setViewMonth] = useState(m)
  const [open, setOpen] = useState(false)

  const today = new Date()
  const todayIso = toIso(today.getFullYear(), today.getMonth() + 1, today.getDate())

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12) }
    else setViewMonth(viewMonth - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1) }
    else setViewMonth(viewMonth + 1)
  }

  function handleSelect(iso: string) {
    setOpen(false)
    onSelect(iso)
  }

  const totalDays = daysInMonth(viewYear, viewMonth)
  const startOffset = firstDayOfWeek(viewYear, viewMonth)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto gap-1.5 px-2 py-0.5 text-base font-normal capitalize text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CalendarDays className="h-4 w-4 shrink-0 opacity-60" />
          {longDate}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-3">
        {/* Cabecera del mes */}
        <div className="mb-2 flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {MONTHS_ES[viewMonth - 1]} {viewYear}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Días de la semana */}
        <div className="mb-1 grid grid-cols-7">
          {DAYS_ES.map((d) => (
            <div key={d} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Días del mes */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`e-${i}`} />
          ))}
          {Array.from({ length: totalDays }).map((_, i) => {
            const day = i + 1
            const iso = toIso(viewYear, viewMonth, day)
            const isSelected = iso === date
            const isToday = iso === todayIso
            const isPast = iso < todayIso

            return (
              <button
                key={iso}
                onClick={() => handleSelect(iso)}
                className={cn(
                  "rounded-md py-1.5 text-center text-[13px] transition-colors",
                  isSelected && "bg-primary text-primary-foreground",
                  !isSelected && isToday && "bg-accent text-accent-foreground font-medium",
                  !isSelected && !isToday && "hover:bg-muted",
                  isPast && !isSelected && "text-muted-foreground",
                )}
              >
                {day}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
