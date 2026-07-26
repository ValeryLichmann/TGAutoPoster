import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy API calls to the server in dev so the Mini App talks to one origin.
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
