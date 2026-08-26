"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changePasswordAction } from "@/lib/auth-actions"

export default function ChangePasswordPage() {
  const [estado, formAction, enviando] = useActionState(changePasswordAction, {})

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <span className="text-lg font-bold text-primary-foreground">L</span>
            </div>
            <span className="text-xl font-semibold">LuciaERP</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Cambia tu contraseña</h1>
          <p className="text-sm text-muted-foreground">
            Es tu primer acceso. Elige una contraseña segura para continuar.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              disabled={enviando}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Repite la contraseña"
              required
              minLength={6}
              disabled={enviando}
              autoComplete="new-password"
            />
          </div>

          {estado.error && (
            <p className="text-sm text-destructive" aria-live="polite">{estado.error}</p>
          )}

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Guardando…" : "Establecer contraseña"}
          </Button>
        </form>
      </div>
    </div>
  )
}
