import { defineConfig } from "vite"

export default defineConfig({
  base: "./",
  server: { port: 3000 },
  build: { chunkSizeWarningLimit: 1200 },
})
