"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    const fd = new FormData(e.currentTarget)
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: fd.get("email"),
        password: fd.get("password"),
      }),
    })

    setIsLoading(false)

    if (res.ok) {
      const data = await res.json()
      router.push(data.mustChangePassword ? "/change-password" : "/agenda")
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error ?? "Error al iniciar sesión.")
    }
  }

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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="usuario@empresa.com"
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Iniciando sesión…" : "Iniciar sesión"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
