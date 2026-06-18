"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changeOwnPassword } from "@/lib/actions"
import { getSession } from "@/lib/session"

export default function ChangePasswordPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    const fd = new FormData(e.currentTarget)
    const newPw = fd.get("newPassword") as string
    const confirm = fd.get("confirmPassword") as string

    if (newPw !== confirm) {
      setError("Las contraseñas no coinciden.")
      return
    }

    setLoading(true)
    const res = await fetch("/api/auth/me")
    const { userId } = await res.json()
    const result = await changeOwnPassword(userId, newPw)
    setLoading(false)

    if (result.ok) {
      window.location.href = "/agenda"
    } else {
      setError(result.error ?? "Error al cambiar la contraseña.")
    }
  }

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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              disabled={loading}
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
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Guardando…" : "Establecer contraseña"}
          </Button>
        </form>
      </div>
    </div>
  )
}
