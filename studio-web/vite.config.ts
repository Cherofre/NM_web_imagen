import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../static/studio",
    emptyOutDir: true
  },
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:7861",
      "/outputs": "http://127.0.0.1:7861"
    }
  }
});
