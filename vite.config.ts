import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminBase = (process.env.VITE_ADMIN_BASE || "/").trim();

export default defineConfig({
  root: path.resolve(__dirname),
  base: adminBase,
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3010, // Admin em porta separada
    allowedHosts: [
      "admin.celebrar.local",
      "admin.celebrarfestasembalagens.com.br",
    ],
    proxy: {
      // Proxy para o backend na porta 3001
      "/login": "http://localhost:3001",
      "/admin": "http://localhost:3001",
      "/catalogo-imagens": "http://localhost:3001",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4010,
    allowedHosts: [
      "admin.celebrar.local",
      "admin.celebrarfestasembalagens.com.br",
    ],
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
