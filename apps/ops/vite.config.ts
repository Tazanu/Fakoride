/**
 * The ops console's build.
 *
 * Two things worth knowing. The design tokens are imported from `design/`
 * rather than copied, so a contrast fix made there reaches this console the
 * same way it reaches both apps — `fs.allow` is what lets Vite serve a file
 * from outside this folder in development.
 *
 * And the API is proxied rather than called cross-origin: the token lives in
 * this tab and a proxy keeps every request same-origin, which means no CORS
 * preflight on every call and no second place to configure an allowed origin.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@design": path.resolve(repoRoot, "design"),
    },
  },
  server: {
    port: 5173,
    /**
     * IPv4, explicitly.
     *
     * Vite's default binds `localhost`, which on this Windows machine resolves
     * to ::1 alone — a browser follows it, but curl, a script or anything
     * pointed at 127.0.0.1 gets connection refused against a server that is
     * plainly running. Metro cost us an afternoon for exactly this reason.
     */
    host: "127.0.0.1",
    fs: { allow: [repoRoot] },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
