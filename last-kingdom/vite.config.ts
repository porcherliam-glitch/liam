import { defineConfig } from "vite"

export default defineConfig({
  base: "./",
  server: { port: 3100 },
  build: { chunkSizeWarningLimit: 1500, target: "es2022" },
})
