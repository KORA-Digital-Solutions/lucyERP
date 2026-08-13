import { execSync } from "child_process"
import { existsSync, unlinkSync } from "fs"
import path from "path"
import { PrismaClient } from "@prisma/client"

const TEST_DB_PATH = path.resolve(__dirname, "..", "prisma", "test.db")
// Relativa a prisma/schema.prisma (así resuelve Prisma las URLs "file:"), NO
// a la raíz del repo — de ahí que no lleve el prefijo "prisma/".
const TEST_DATABASE_URL = "file:./test.db"

// Corre una vez antes de toda la batería: recrea el esquema en una base
// SQLite de test aislada (nunca prisma/dev.db) y siembra la única "clínica
// activa" que getActiveClinic() espera encontrar (coge la primera por
// createdAt). Los tests solo limpian/crean filas de horario, empleadas y
// vacaciones sobre esa clínica — ver tests/helpers.ts.
export default async function setup() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const f = TEST_DB_PATH + suffix
    if (existsSync(f)) unlinkSync(f)
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  })

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } })
  try {
    await prisma.clinic.create({
      data: {
        name: "Clínica de test",
        openingTime: "09:00",
        closingTime: "20:00",
      },
    })
  } finally {
    await prisma.$disconnect()
  }
}
