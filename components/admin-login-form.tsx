"use client"

import React, { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginAction } from "@/lib/auth-actions"

/**
 * Gestión del centro: la otra puerta.
 *
 * Usuario y contraseña, y solo para administradoras. Las trabajadoras entran
 * por el teclado de /login, que es la pantalla que se ve al encender.
 *
 * El nombre y el eslogan vienen de Configuración, como en la del PIN: tenerlos
 * escritos a mano en dos sitios era garantía de que un día dejaran de cuadrar.
 */
export function AdminLoginForm() {
  const [estado, formAction, enviando] = useActionState(loginAction, {})
  const [showPassword, setShowPassword] = useState(false)
  // React vacía los campos del formulario al terminar una server action. La
  // contraseña interesa que se borre; el usuario no, o hay que reescribirlo
  // entero cada vez que se falla. Al ser un campo controlado, sobrevive.
  const [usuario, setUsuario] = useState("")

  // Limpieza de urls antiguas: hasta ahora este formulario no declaraba
  // method, y un <form> sin method es GET, así que si se enviaba antes de que
  // React hidratara la página se acababa en /login?email=...&password=... Eso
  // ya no puede pasar (la server action se renderiza con method="post"), pero
  // esas urls siguen en el historial y en el autocompletado del navegador.
  // Al abrir la página se reescribe la entrada actual para quitarlas de ahí.
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [])

  return (
    <>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Gestión del centro</h1>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Usuario</Label>
          <Input
            id="email"
            name="email"
            type="text"
            placeholder="usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            disabled={enviando}
            autoComplete="username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              disabled={enviando}
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {estado.error && (
          <p className="text-sm text-destructive" aria-live="polite">{estado.error}</p>
        )}

        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al mostrador
      </Link>
    </>
  )
}
