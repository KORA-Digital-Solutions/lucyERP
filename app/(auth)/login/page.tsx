"use client"

import React, { useActionState, useEffect, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginAction } from "@/lib/auth-actions"

export default function LoginPage() {
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
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand Side */}
      <div className="hidden lg:flex flex-col justify-between bg-sidebar p-10 text-sidebar-foreground">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">L</span>
          </div>
          <span className="text-xl font-semibold">LuciaERP</span>
        </div>

        <div className="space-y-6">
          <blockquote className="space-y-2">
            <p className="text-lg leading-relaxed">
              &ldquo;Sencillamente... lo que tu piel necesita&rdquo;
            </p>
            <footer className="text-sm text-sidebar-muted">
              Centro de Estética Lucía
            </footer>
          </blockquote>
        </div>

        <p className="text-xs text-sidebar-muted">
          © 2026 LuciaERP. Todos los derechos reservados.
        </p>
      </div>

      {/* Form Side */}
      <div className="flex items-center justify-center p-8">
        <div className="mx-auto w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <span className="text-lg font-bold text-primary-foreground">L</span>
              </div>
              <span className="text-xl font-semibold">LuciaERP</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Bienvenido de nuevo</h1>
            <p className="text-sm text-muted-foreground">
              Introduce tus credenciales para acceder
            </p>
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
              {enviando ? "Iniciando sesión…" : "Iniciar sesión"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
