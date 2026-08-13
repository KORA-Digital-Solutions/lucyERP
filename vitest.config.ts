import { defineConfig } from "vitest/config"
import path from "path"

// Batería funcional para horario/vacaciones/festivos (ver tests/schedule/).
// Corre contra una base SQLite de test aislada (prisma/test.db), nunca contra
// prisma/dev.db. globalSetup aplica el esquema antes de la primera suite.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globalSetup: "./tests/global-setup.ts",
    env: {
      DATABASE_URL: "file:./prisma/test.db",
    },
    // Las suites comparten una única "clínica activa" (mismo supuesto que la
    // app real: getActiveClinic() coge la primera clínica). Correrlas en
    // paralelo entre archivos no da problemas porque cada archivo limpia solo
    // sus propias filas de horario, pero forzamos un único fork para evitar
    // contención de escritura en el fichero SQLite compartido.
    fileParallelism: false,
  },
})
