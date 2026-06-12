import { cn } from "@/lib/utils"

/**
 * Isotipo "Centro de Estética Lucía": dos perfiles de rostro superpuestos.
 * Recreación vectorial con la paleta de marca. `tone` permite adaptarlo a
 * fondos oscuros (sidebar) o claros.
 */
export function LuciaMark({
  className,
  tone = "color",
}: {
  className?: string
  tone?: "color" | "light"
}) {
  const back = tone === "light" ? "#AFB9D9" : "#AFB9D9"
  const front = tone === "light" ? "#E5E9F7" : "#3C54A4"
  const accent = tone === "light" ? "#FFFFFF" : "#5F73B4"

  // Silueta de rostro de perfil mirando a la derecha (lado derecho = cara).
  const profile =
    "M48 8 C62 8 74 18 78 34 C80 42 78 46 84 52 C88 56 88 58 82 60 " +
    "C78 62 78 64 82 68 C84 72 82 78 74 86 C70 90 66 92 64 96 L64 120 " +
    "L34 120 L34 100 C24 96 16 84 14 66 C12 52 14 40 20 30 C26 16 36 8 48 8 Z"

  return (
    <svg viewBox="0 0 96 128" className={cn("block", className)} aria-hidden="true">
      {/* perfil trasero (desplazado a la izquierda) */}
      <g transform="translate(-16 0)">
        <path d={profile} fill={back} />
      </g>
      {/* perfil delantero */}
      <path d={profile} fill={front} />
      {/* línea de acento del perfil delantero */}
      <path
        d="M52 18 C40 22 30 32 27 46 C25 56 27 64 31 72"
        fill="none"
        stroke={accent}
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  )
}

/** Logotipo completo (isotipo + texto) para fondos claros. */
export function LuciaLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LuciaMark className="h-12 w-auto" tone="color" />
      <div className="leading-tight">
        <div className="text-2xl font-bold text-[#3C54A4]">Lucía</div>
        <div className="text-sm tracking-wide text-[#3C54A4]">CENTRO DE ESTÉTICA</div>
      </div>
    </div>
  )
}
