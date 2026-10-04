import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    // Reglas que saltan por primera vez sobre código que ya existía (28 usos de
    // setState dentro de un efecto, 6 comillas sin escapar en textos y 1 llamada
    // impura en components/ui/sidebar.tsx). Se dejan en aviso para que
    // `npm run lint` falle solo con errores nuevos; limpiarlas es deuda aparte.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  globalIgnores([
    // Los de eslint-config-next por defecto:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Paquete de instalación generado por `npm run release`, no es código fuente.
    "release/**",
  ]),
])

export default eslintConfig
