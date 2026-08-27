"use client"

/**
 * Aviso de "esto es solo consulta" en la gestión del centro.
 *
 * Vive en el layout y decide él solo cuándo aparece, mirando la ruta: repetir
 * el aviso en las seis pantallas del día a día es seis sitios donde olvidarse
 * de ponerlo.
 *
 * Es un aviso, no una barrera: quien manda es requireCounter() en el servidor
 * (ver lib/auth.ts). Si esto no estuviera, la acción se caería igual.
 */

import { usePathname } from "next/navigation"
import { Eye } from "lucide-react"

/** Las pantallas del día a día, que desde la gestión solo se miran. */
const DIA_A_DIA = ["/dashboard", "/agenda", "/clients", "/sales", "/cash-register", "/stock"]

export function ReadOnlyBanner() {
  const pathname = usePathname()
  const enDiaADia = DIA_A_DIA.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (!enDiaADia) return null

  return (
    <div className="flex items-center justify-center gap-2 border-b border-[#F59E0B]/40 bg-[#FEF3E2] px-6 py-2 text-sm text-[#92400E]">
      <Eye className="h-4 w-4 shrink-0" />
      <p>
        Solo consulta. Para cobrar o tocar la agenda, cierra sesión y entra por el mostrador con tu PIN.
      </p>
    </div>
  )
}
