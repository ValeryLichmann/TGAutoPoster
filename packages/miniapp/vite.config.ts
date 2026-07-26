import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Allow the app to be opened through a tunnel (ngrok / cloudflared) so it
    // can run as a real Telegram Mini App. Recent Vite versions block unknown
    // Host headers by default, which breaks tunnels without this.
    allowedHosts: [".ngrok-free.dev", ".ngrok.io", ".ngrok.app", ".trycloudflare.com", ".loca.lt"],
    proxy: {
      // Proxy API calls to the server in dev so the Mini App talks to one origin.
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
