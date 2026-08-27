import { LuciaMark } from "@/components/lucia-logo"

/**
 * El marco de las dos puertas de entrada: el mostrador y la gestión.
 *
 * Las dos pantallas son la misma casa, así que se ven igual — el panel azul
 * del centro a la izquierda y lo que hay que teclear a la derecha. Cambia lo
 * de la derecha y nada más.
 *
 * El nombre y el eslogan vienen de Configuración. En pantallas estrechas el
 * panel azul se esconde y la marca pasa arriba, que si no el teclado se queda
 * sin sitio.
 */
export function AuthShell({ clinicName, slogan, children }: {
  clinicName: string
  slogan: string | null
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/95 p-1.5 shadow-sm">
            <LuciaMark className="h-full w-auto" tone="color" />
          </div>
          <span className="text-xl font-semibold">LuciaERP</span>
        </div>

        <blockquote className="space-y-2">
          {slogan && <p className="text-lg leading-relaxed">&ldquo;{slogan}&rdquo;</p>}
          <footer className="text-sm text-sidebar-muted">{clinicName}</footer>
        </blockquote>

        <p className="text-xs text-sidebar-muted">
          © 2026 LuciaERP. Todos los derechos reservados.
        </p>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-black/5">
              <LuciaMark className="h-full w-auto" tone="color" />
            </div>
            <span className="text-lg font-semibold">{clinicName}</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
