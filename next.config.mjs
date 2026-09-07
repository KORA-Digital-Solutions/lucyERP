/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build autónomo para el PC del centro: `.next/standalone` trae su propio
  // server.js y solo las dependencias que se usan, así que allí no hace falta
  // ni npm install ni internet (ver INSTALAR.md).
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
